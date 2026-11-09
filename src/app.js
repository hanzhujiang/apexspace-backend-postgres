const express = require('express');

const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const coreAuthRouter = require('./routes/coreRoutes/coreAuth');
const coreApiRouter = require('./routes/coreRoutes/coreApi');
const coreDownloadRouter = require('./routes/coreRoutes/coreDownloadRouter');
const corePublicRouter = require('./routes/coreRoutes/corePublicRouter');
const adminAuth = require('./controllers/coreControllers/adminAuth');
const errorHandlers = require('./handlers/errorHandlers');
const erpApiRouter = require('./routes/appRoutes/appApi');
const userTimezone = require('./middlewares/userTimezone');

const fileUpload = require('express-fileupload');
const app = express();

app.use(
    cors({
        origin: function (origin, callback) {
            callback(null, true); // 允许所有来源
        },
        methods: "GET,POST,PUT,DELETE,OPTIONS,PATCH",
        allowedHeaders: "Content-Type,Authorization,X-User-Timezone",
        credentials: true, // 允许前端携带 cookies 或认证信息
    })
);

app.options("*", cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());


app.use('/api', coreAuthRouter);
app.use('/api', adminAuth.isValidAuthToken, userTimezone, coreApiRouter);
app.use('/api', adminAuth.isValidAuthToken, userTimezone, adminAuth.checkPermission, erpApiRouter);
app.use('/download', coreDownloadRouter);
app.use('/public', corePublicRouter);

// If that above routes didnt work, we 404 them and forward to error handler
app.use(errorHandlers.notFound);

// production error handler
app.use(errorHandlers.productionErrors);

// done! we export it so we can start the site in start.js
module.exports = app;
