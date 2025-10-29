import mysql2 from "mysql2/promise";

let pool;

const connectDB = async (config)=>{
    try
    {
        pool = mysql2.createPool({
        user: config.user,
        password : config.password,
        database : config.database_name,
        host: config.host,
        port: config.port,
        ssl: {
            ca:config.cert.replace(/\\n/g, '\n') //fs.readFileSync('./cert/ca.pem') // Required by Aiven
          },
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit:0
        });

    await pool.query('SELECT 1');
    console.log("DB connected Successfully");
    return pool;
    }catch(error){
        console.error("failed to connecte to db", error.message);
        throw error;
    }

}

const getPool = ()=>{
    if (!pool) throw new Error("Database not initialized");
    return pool;
}

export {connectDB,getPool};