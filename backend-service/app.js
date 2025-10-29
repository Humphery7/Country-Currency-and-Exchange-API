import express from "express";
import cors from "cors";
import router from './routes/route.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/', router)

app.use(notFound);
app.use(errorHandler);


export default app;