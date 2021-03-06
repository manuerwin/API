"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const bunyan = require("bunyan");
const core_decorators_1 = require("core-decorators");
const cors = require("cors");
const express = require("express");
const fs = require("fs");
const helmet = require("helmet");
const http = require("http");
const https = require("https");
const mkdirp = require("mkdirp");
const path = require("path");
const bookmarksRouter_1 = require("./bookmarksRouter");
const bookmarksService_1 = require("./bookmarksService");
const config_1 = require("./config");
const db_1 = require("./db");
const exception_1 = require("./exception");
const infoRouter_1 = require("./infoRouter");
const infoService_1 = require("./infoService");
const newSyncLogsService_1 = require("./newSyncLogsService");
var ApiStatus;
(function (ApiStatus) {
    ApiStatus[ApiStatus["online"] = 1] = "online";
    ApiStatus[ApiStatus["offline"] = 2] = "offline";
    ApiStatus[ApiStatus["noNewSyncs"] = 3] = "noNewSyncs";
})(ApiStatus = exports.ApiStatus || (exports.ApiStatus = {}));
var ApiVerb;
(function (ApiVerb) {
    ApiVerb["delete"] = "delete";
    ApiVerb["get"] = "get";
    ApiVerb["options"] = "options";
    ApiVerb["patch"] = "patch";
    ApiVerb["post"] = "post";
    ApiVerb["put"] = "put";
})(ApiVerb = exports.ApiVerb || (exports.ApiVerb = {}));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["Error"] = 0] = "Error";
    LogLevel[LogLevel["Info"] = 1] = "Info";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
// Main class for the xBrowserSync api service
class Server {
    constructor() {
        this.logToConsole = true;
        this.rateLimit = require('express-rate-limit');
    }
    // Throws an error if the service status is set to offline in config
    static checkServiceAvailability() {
        if (!config_1.default.get().status.online) {
            throw new exception_1.ServiceNotAvailableException();
        }
    }
    getApplication() {
        return this.app;
    }
    // Initialises the xBrowserSync api service when a new instance is created
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.configureServer();
                this.prepareDataServices();
                this.prepareRoutes();
                this.app.use(this.handleErrors);
                // Establish database connection
                yield this.connectToDb();
            }
            catch (err) {
                this.log(LogLevel.Error, `Service failed to start`, null, err);
                process.exit(1);
            }
        });
    }
    // Logs messages and errors to console and to file (if enabled)
    log(level, message, req, err) {
        const writeToLogFile = (logAction) => {
            if (!config_1.default.get().log.enabled || !logAction) {
                return;
            }
            if (!this.logger) {
                console.error('Unable to write to log as it has not been initialised.');
                return;
            }
            logAction();
        };
        const writeToConsole = (logAction) => {
            if (!this.logToConsole) {
                return;
            }
            logAction();
        };
        switch (level) {
            case LogLevel.Error:
                writeToLogFile(() => {
                    this.logger.error({ req, err }, message);
                });
                writeToConsole(() => {
                    console.error(err ? `${message}: ${err.message}` : message);
                });
                break;
            case LogLevel.Info:
                writeToLogFile(() => {
                    this.logger.info({ req }, message);
                });
                writeToConsole(() => {
                    console.log(message);
                });
                break;
        }
    }
    // Enables/disables logging messages to the console
    logToConsoleEnabled(logToConsole) {
        this.logToConsole = logToConsole;
    }
    // Starts the api service
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            // Create https server if enabled in config, otherwise create http server
            if (config_1.default.get().server.https.enabled) {
                const options = {
                    cert: fs.readFileSync(config_1.default.get().server.https.certPath),
                    key: fs.readFileSync(config_1.default.get().server.https.keyPath)
                };
                this.server = https.createServer(options, this.app);
            }
            else {
                this.server = http.createServer(this.app);
            }
            this.server.listen(config_1.default.get().server.port);
            // Wait for server to start before continuing
            yield new Promise((resolve, reject) => {
                this.server.on('error', (err) => {
                    this.log(LogLevel.Error, `Uncaught exception occurred`, null, err);
                    this.server.close(() => __awaiter(this, void 0, void 0, function* () {
                        yield this.cleanupServer();
                        process.exit(1);
                    }));
                });
                this.server.on('listening', conn => {
                    this.log(LogLevel.Info, `Service started on ${config_1.default.get().server.host}:${config_1.default.get().server.port}`);
                    resolve();
                });
            });
            // Catches ctrl+c event
            process.on('SIGINT', () => {
                this.log(LogLevel.Info, `Process terminated by SIGINT`, null, null);
                this.server.close(() => __awaiter(this, void 0, void 0, function* () {
                    yield this.cleanupServer();
                    process.exit(0);
                }));
            });
            // Catches kill pid event
            process.on('SIGUSR1', () => {
                this.log(LogLevel.Info, `Process terminated by SIGUSR1`, null, null);
                this.server.close(() => __awaiter(this, void 0, void 0, function* () {
                    yield this.cleanupServer();
                    process.exit(0);
                }));
            });
            // Catches kill pid event
            process.on('SIGUSR2', () => {
                this.log(LogLevel.Info, `Process terminated by SIGUSR2`, null, null);
                this.server.close(() => __awaiter(this, void 0, void 0, function* () {
                    yield this.cleanupServer();
                    process.exit(0);
                }));
            });
        });
    }
    // Stops the api service
    stop() {
        return new Promise(resolve => {
            this.server.close(() => __awaiter(this, void 0, void 0, function* () {
                yield this.cleanupServer();
                resolve();
            }));
        });
    }
    // Cleans up server connections when stopping the service
    cleanupServer() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log(LogLevel.Info, `Service shutting down`);
            yield this.db.closeConnection();
            this.server.removeAllListeners();
            process.removeAllListeners();
        });
    }
    // Initialises the express application and middleware
    configureServer() {
        this.app = express();
        // Add logging if required
        if (config_1.default.get().log.enabled) {
            try {
                // Ensure log directory exists
                const logDirectory = config_1.default.get().log.path.substring(0, config_1.default.get().log.path.lastIndexOf('/'));
                if (!fs.existsSync(logDirectory)) {
                    mkdirp.sync(logDirectory);
                }
                // Initialise bunyan logger
                this.logger = bunyan.createLogger({
                    level: config_1.default.get().log.level,
                    name: 'xBrowserSync_api',
                    serializers: bunyan.stdSerializers,
                    streams: [
                        {
                            count: config_1.default.get().log.rotatedFilesToKeep,
                            level: config_1.default.get().log.level,
                            path: config_1.default.get().log.path,
                            period: config_1.default.get().log.rotationPeriod,
                            type: 'rotating-file'
                        }
                    ]
                });
            }
            catch (err) {
                console.error(`Failed to initialise log file.`);
                throw err;
            }
        }
        // Set default config for helmet security hardening
        const helmetConfig = {
            noCache: true
        };
        this.app.use(helmet(helmetConfig));
        // Add default version to request if not supplied
        this.app.use((req, res, next) => {
            req.version = req.headers['accept-version'] || config_1.default.get().version;
            next();
        });
        // If behind proxy use 'X-Forwarded-For' header for client ip address
        if (config_1.default.get().server.behindProxy) {
            this.app.enable('trust proxy');
        }
        // Process JSON-encoded bodies, set body size limit to config value or default to 500kb
        this.app.use(express.json({
            limit: config_1.default.get().maxSyncSize || 512000
        }));
        // Enable support for CORS
        const corsOptions = config_1.default.get().allowedOrigins.length > 0 && {
            origin: (origin, callback) => {
                if (config_1.default.get().allowedOrigins.indexOf(origin) !== -1) {
                    callback(null, true);
                }
                else {
                    const err = new exception_1.OriginNotPermittedException();
                    callback(err);
                }
            }
        };
        this.app.use(cors(corsOptions));
        this.app.options('*', cors(corsOptions));
        // Add thottling if enabled
        if (config_1.default.get().throttle.maxRequests > 0) {
            this.app.use(new this.rateLimit({
                delayMs: 0,
                handler: (req, res, next) => {
                    next(new exception_1.RequestThrottledException());
                },
                max: config_1.default.get().throttle.maxRequests,
                windowMs: config_1.default.get().throttle.timeWindow
            }));
        }
    }
    // Initialises and connects to mongodb
    connectToDb() {
        return __awaiter(this, void 0, void 0, function* () {
            this.db = new db_1.default(this.log);
            yield this.db.openConnection();
        });
    }
    // Handles and logs api errors
    handleErrors(err, req, res, next) {
        if (err) {
            let responseObj;
            // Determine the response value based on the error thrown
            switch (true) {
                // If the error is one of our exceptions get the reponse object to return to the client
                case err instanceof exception_1.ExceptionBase:
                    responseObj = err.getResponseObject();
                    break;
                // If the error is 413 Request Entity Too Large return a SyncDataLimitExceededException
                case err.status === 413:
                    err = new exception_1.SyncDataLimitExceededException();
                    responseObj = err.getResponseObject();
                    break;
                // Otherwise return an UnspecifiedException
                default:
                    err = new exception_1.UnspecifiedException();
                    responseObj = err.getResponseObject();
            }
            res.status(err.status || 500);
            res.json(responseObj);
        }
    }
    // Initialise data services
    prepareDataServices() {
        this.newSyncLogsService = new newSyncLogsService_1.default(null, this.log);
        this.bookmarksService = new bookmarksService_1.default(this.newSyncLogsService, this.log);
        this.infoService = new infoService_1.default(this.bookmarksService, this.log);
    }
    // Configures api routing
    prepareRoutes() {
        const router = express.Router();
        this.app.use('/', router);
        // Configure bookmarks routing
        const bookmarksRouter = new bookmarksRouter_1.default(this.bookmarksService);
        this.app.use('/bookmarks', bookmarksRouter.router);
        // Configure info routing
        const infoRouter = new infoRouter_1.default(this.infoService);
        this.app.use('/info', infoRouter.router);
        // Configure static route for documentation
        this.app.use('/', express.static(path.join(__dirname, 'docs')));
        // Handle all other routes with 404 error
        this.app.use((req, res, next) => {
            const err = new exception_1.NotImplementedException();
            next(err);
        });
    }
}
__decorate([
    core_decorators_1.autobind
], Server.prototype, "log", null);
__decorate([
    core_decorators_1.autobind
], Server.prototype, "start", null);
exports.default = Server;
//# sourceMappingURL=server.js.map