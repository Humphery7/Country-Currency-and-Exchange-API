import { getPool } from "../db/connectdb.js";
import fetch from "node-fetch";
import fs from 'fs';
import path from 'path';
import { Jimp, loadFont } from 'jimp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUMMARY_DIR = path.resolve(__dirname, '..', 'cache');
const SUMMARY_IMAGE_PATH = path.join(SUMMARY_DIR, 'summary.png');

const withTimeout = async (url, options = {}, timeoutMs = 15000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try{
        return await fetch(url, { ...options, signal: controller.signal });
    }finally{
        clearTimeout(timeout);
    }
};

const refreshCountries = async(req,res)=>{
    let connection;
    try{
        const countryData = await withTimeout('https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies');
        const exchangeRate = await withTimeout('https://open.er-api.com/v6/latest/USD');

        if (!countryData.ok) {
            return res.status(503).json({ error: "External data source unavailable", details: "Could not fetch data from restcountries" });
          }
        
        if (!exchangeRate.ok) {
            return res.status(503).json({ error: "External data source unavailable", details: "Could not fetch data from open.er-api" });
          }
        
        const countryDataJson = await countryData.json();
        const exchangeRateJson = await exchangeRate.json();
        const countryResponse = countryDataJson.map((element)=>{
            const countryCurrencyCode = element.currencies?.[0]?.code || null;
            // If no currency code, we must store nulls and estimated_gdp = 0 per spec
            const countryExchangeRate = countryCurrencyCode ? (exchangeRateJson.rates?.[countryCurrencyCode] ?? null) : null;
            const multiplier = 1000 + Math.random() * 1000;
            const estimatedGDP = countryExchangeRate === null ? (countryCurrencyCode ? null : 0) : (element.population * multiplier / countryExchangeRate);

            return {
                name: element.name,
                capital: element.capital || null,
                region: element.region || null,
                population: element.population,
                currency_code: countryCurrencyCode,
                exchange_rate: countryExchangeRate,
                estimated_gdp: estimatedGDP,
                flag_url: element.flag || null,
                last_refreshed_at: Date.now()
            };
        });
    
        const pool = getPool();
        connection = await pool.getConnection();
        await connection.query(`
            CREATE TABLE IF NOT EXISTS countries_table (
              id INT AUTO_INCREMENT PRIMARY KEY,
              name VARCHAR(100) UNIQUE,
              capital VARCHAR(100),
              region VARCHAR(100),
              population BIGINT,
              currency_code VARCHAR(10),
              exchange_rate DOUBLE,
              estimated_gdp DOUBLE,
              flag_url TEXT,
              last_refreshed_at BIGINT
            )
          `);

        const insertQuery = `INSERT INTO countries_table 
          (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at)
          VALUES ?
          ON DUPLICATE KEY UPDATE 
            capital=VALUES(capital),
            region=VALUES(region),
            population=VALUES(population),
            currency_code=VALUES(currency_code),
            exchange_rate=VALUES(exchange_rate),
            estimated_gdp=VALUES(estimated_gdp),
            flag_url=VALUES(flag_url),
            last_refreshed_at=VALUES(last_refreshed_at)`;

        const values = countryResponse.map(c => [
        c.name, c.capital, c.region, c.population, c.currency_code,
        c.exchange_rate, c.estimated_gdp, c.flag_url, c.last_refreshed_at
            ]);

        await connection.query(insertQuery, [values]);

        // Generate summary image
        try{
            await generateSummaryImage(connection);
        }catch(imageErr){
            // Non-fatal: log and continue
            console.error('Failed to generate summary image:', imageErr.message);
        }

        connection.release();

        res.status(200).json({
            message: "Countries refreshed successfully",
            total: values.length,
            last_refreshed_at: new Date().toISOString()
          });

        }catch (error) {
            console.error(error.message);
            if (error.name === 'AbortError'){
                return res.status(503).json({ error: "External data source unavailable", details: "Could not fetch data from restcountries or open.er-api" });
            }
            res.status(500).json({ error: "Internal server error", details: error.message });
        }finally{
            if (connection) connection.release();
        }
 };
        

const getCountriesDB = async(req,res)=>{
    let connection;
    try{
        const pool = getPool();
        connection = await pool.getConnection();

        const { region, currency, sort } = req.query;

        // Validate query params and return 400 on invalid inputs
        const errors = {};
        if (region !== undefined && typeof region !== 'string') {
            errors.region = 'must be a string';
        }
        if (currency !== undefined && typeof currency !== 'string') {
            errors.currency = 'must be a string';
        }
        if (sort !== undefined && typeof sort !== 'string') {
            errors.sort = 'must be a string';
        }
        const allowedSort = ['gdp_desc', 'gdp_asc'];
        if (typeof sort === 'string' && sort.length && !allowedSort.includes(sort)) {
            errors.sort = `must be one of: ${allowedSort.join(', ')}`;
        }
        if (Object.keys(errors).length) {
            return res.status(400).json({ error: 'Validation failed', details: errors });
        }

        const clauses = [];
        const params = [];

        if (region){
            clauses.push('LOWER(region) = LOWER(?)');
            params.push(region);
        }
        if (currency){
            clauses.push('LOWER(currency_code) = LOWER(?)');
            params.push(currency);
        }

        let query = 'SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries_table';
        if (clauses.length){
            query += ' WHERE ' + clauses.join(' AND ');
        }

        if (sort === 'gdp_desc'){
            query += ' ORDER BY (estimated_gdp IS NULL) ASC, estimated_gdp DESC';
        }else if (sort === 'gdp_asc'){
            query += ' ORDER BY (estimated_gdp IS NULL) ASC, estimated_gdp ASC';
        }

        const [rows] = await connection.query(query, params);
        const formattedRows = rows.map(row => ({
            ...row,
            last_refreshed_at: new Date(row.last_refreshed_at).toISOString()
        }));
        res.status(200).json(formattedRows);
    }catch(error){
        console.error(error.message);
        res.status(500).json({ error: "Internal server error" });
    }finally{
        if (connection) connection.release();
    }
};

const getOneCountry = async (req,res)=>{
    let connection;
    try{
        const name = req.params.name;
        if (!name){
            return res.status(400).json({ error: "Validation failed", details: { name: "is required" }});
        }
        const pool = getPool();
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            'SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries_table WHERE LOWER(name)=LOWER(?) LIMIT 1',
            [name]
        );
        if (!rows.length){
            return res.status(404).json({ error: "Country not found" });
        }
        
        res.status(200).json({
            ...rows[0],
            last_refreshed_at: rows[0].last_refreshed_at
                ? new Date(rows[0].last_refreshed_at).toISOString()
                : null
        });
    }catch(error){
        console.error(error.message);
        res.status(500).json({ error: "Internal server error" });
    }finally{
        if (connection) connection.release();
    }
};

const deleteCountry = async (req,res)=>{
    let connection;
    try{
        const name = req.params.name;
        if (!name){
            return res.status(400).json({ error: "Validation failed", details: { name: "is required" }});
        }
        const pool = getPool();
        connection = await pool.getConnection();
        const [result] = await connection.query('DELETE FROM countries_table WHERE LOWER(name)=LOWER(?)', [name]);
        if (result.affectedRows === 0){
            return res.status(404).json({ error: "Country not found" });
        }
        res.status(200).json({ message: 'Country deleted' });
    }catch(error){
        console.error(error.message);
        res.status(500).json({ error: "Internal server error" });
    }finally{
        if (connection) connection.release();
    }
};

const getStatus = async (req,res)=>{
    let connection;
    try{
        const pool = getPool();
        connection = await pool.getConnection();
        await connection.query(`
            CREATE TABLE IF NOT EXISTS countries_table (
              id INT AUTO_INCREMENT PRIMARY KEY,
              name VARCHAR(100) UNIQUE,
              capital VARCHAR(100),
              region VARCHAR(100),
              population BIGINT,
              currency_code VARCHAR(10),
              exchange_rate DOUBLE,
              estimated_gdp DOUBLE,
              flag_url TEXT,
              last_refreshed_at BIGINT
            )
        `);
        const [[countRow]] = await connection.query('SELECT COUNT(*) AS total_countries FROM countries_table');
        const [[lastRow]] = await connection.query('SELECT MAX(last_refreshed_at) AS last_refreshed_at FROM countries_table');
        res.status(200).json({
            total_countries: countRow.total_countries || 0,
            last_refreshed_at: lastRow.last_refreshed_at ? new Date(lastRow.last_refreshed_at).toISOString() : null
        });
    }catch(error){
        console.error(error.message);
        res.status(500).json({ error: "Internal server error" });
    }finally{
        if (connection) connection.release();
    }
};

const serveImage = async (req,res)=>{
    try{
        if (!fs.existsSync(SUMMARY_IMAGE_PATH)){
            return res.status(404).json({ error: "Summary image not found" });
        }
        res.setHeader('Content-Type', 'image/png');
        fs.createReadStream(SUMMARY_IMAGE_PATH).pipe(res);
    }catch(error){
        console.error(error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};


export {refreshCountries, getCountriesDB, getOneCountry, deleteCountry, getStatus, serveImage};

async function generateSummaryImage(connection){
    if (!fs.existsSync(SUMMARY_DIR)){
        fs.mkdirSync(SUMMARY_DIR, { recursive: true });
    }

    const [[countRow]] = await connection.query('SELECT COUNT(*) AS total_countries FROM countries_table');
    const [topRows] = await connection.query(
        'SELECT name, estimated_gdp FROM countries_table WHERE estimated_gdp IS NOT NULL ORDER BY estimated_gdp DESC LIMIT 5'
    );
    const [[lastRow]] = await connection.query('SELECT MAX(last_refreshed_at) AS last_refreshed_at FROM countries_table');

    const width = 800;
    const height = 400;

    const totalText = `Total countries: ${countRow.total_countries || 0}`;
    const lastText = `Last refresh: ${lastRow.last_refreshed_at ? new Date(lastRow.last_refreshed_at).toISOString() : 'N/A'}`;
    const topTitle = 'Top 5 by estimated GDP:';
    const topLines = topRows.map((row, idx) => {
        const gdp = row.estimated_gdp ? Number(row.estimated_gdp).toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A';
        return `${idx + 1}. ${row.name} — ${gdp}`;
    });

    // Jimp-only rendering with bitmap fonts (no Sharp dependency)
    const image = new Jimp({ width, height, color: 0x1f2937ff });

    // Robust font resolution across different Jimp package layouts
    const findExisting = (candidates) => candidates.find(p => fs.existsSync(p));
    const fontPaths32 = [
        path.resolve(__dirname, '..', 'node_modules', '@jimp', 'plugin-print', 'fonts', 'open-sans', 'open-sans-32-white', 'open-sans-32-white.fnt'),
        path.resolve(__dirname, '..', 'node_modules', 'jimp', 'fonts', 'open-sans', 'open-sans-32-white', 'open-sans-32-white.fnt')
    ];
    const fontPaths16 = [
        path.resolve(__dirname, '..', 'node_modules', '@jimp', 'plugin-print', 'fonts', 'open-sans', 'open-sans-16-white', 'open-sans-16-white.fnt'),
        path.resolve(__dirname, '..', 'node_modules', 'jimp', 'fonts', 'open-sans', 'open-sans-16-white', 'open-sans-16-white.fnt')
    ];

    const font32Path = findExisting(fontPaths32) || null;
    const font16Path = findExisting(fontPaths16) || null;

    let fontTitle;
    let fontBody;
    try{
        if (font32Path){
            fontTitle = await loadFont(font32Path);
        }else if (font16Path){
            fontTitle = await loadFont(font16Path);
        }else{
            throw new Error('No bitmap fonts found in node_modules');
        }
    }catch(e){
        console.warn('Failed loading title font, using minimal fallback:', e.message);
        fontTitle = await loadFont(font16Path);
    }

    try{
        if (font16Path){
            fontBody = await loadFont(font16Path);
        }else{
            fontBody = fontTitle;
        }
    }catch(e){
        console.warn('Failed loading body font, reusing title font:', e.message);
        fontBody = fontTitle;
    }

    image.print({ font: fontTitle, x: 20, y: 20, text: 'Country Currency & Exchange Summary' });
    image.print({ font: fontBody, x: 20, y: 80, text: totalText });
    image.print({ font: fontBody, x: 20, y: 110, text: lastText });
    image.print({ font: fontBody, x: 20, y: 160, text: topTitle });
    topLines.forEach((t, i) => {
        image.print({ font: fontBody, x: 40, y: 190 + i * 28, text: t });
    });

    await image.write(SUMMARY_IMAGE_PATH);
}


