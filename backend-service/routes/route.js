import express from "express";
import {refreshCountries, getCountriesDB, getOneCountry, deleteCountry, getStatus, serveImage} from "../controller/controller.js";

const router = express.Router();

router.get('/status', getStatus);
router.get('/countries', getCountriesDB);
router.post('/countries/refresh', refreshCountries);
router.get('/countries/image', serveImage)
router.get('/countries/:name', getOneCountry);
router.delete('/countries/:name', deleteCountry);

export default router;