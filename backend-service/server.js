import app from "./app.js";
import dotenv from "dotenv";
import {connectDB} from "./db/connectdb.js";
import cleanEnv from "./utils/utils.js";

dotenv.config();


const PORT = cleanEnv(process.env.PORT) || 3000;


const start = async()=>{

    try{
        await connectDB({
            user: cleanEnv(process.env.DB_USER),
            password: cleanEnv(process.env.DB_PASSWORD),
            host: cleanEnv(process.env.DB_HOST),
            database_name: cleanEnv(process.env.DB_DATABASE_NAME),
            port: cleanEnv(process.env.DB_PORT),
            cert: process.env.DB_CERT

        })
        app.listen(PORT, ()=>{
            console.log(`Server started on port ${PORT}`);
        });
    }catch(error){
        console.error('an error occured while starting server', error.message);
    }

};

start();