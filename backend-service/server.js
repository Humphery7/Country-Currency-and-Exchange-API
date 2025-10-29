import app from "./app.js";
import dotenv from "dotenv";
import {connectDB} from "./db/connectdb.js";

dotenv.config();


const PORT = process.env.PORT || 3000;


const start = async()=>{

    try{
        await connectDB({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            host: process.env.DB_HOST,
            database_name: process.env.DB_DATABASE_NAME,
            port: process.env.DB_PORT,
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