var xBrowserSync = xBrowserSync || {};
xBrowserSync.API = xBrowserSync.API || {};

/* ------------------------------------------------------------------------------------
 * Class name:  xBrowserSync.API.Config 
 * Description: Stores local environment config info.
 * ------------------------------------------------------------------------------------ */

xBrowserSync.API.Config = function() {
    'use strict';
    
    return {
        allowNewSyncs: true,
        apiName: 'xBrowserSync-API',
        db: {
            host: 'localhost',
            name: 'xBrowserSync',        
            username: process.env.XBROWSERSYNC_DB_USER,
            password: process.env.XBROWSERSYNC_DB_PWD
        },
        ipAddress: '127.0.0.1',
        maxSyncs: 1,
        maxPayloadSize: 5242880,
        port: '8080',
        throttle: {
            burst: 50,
            rate: 100
        },
        version: '1.0.0'
    };
};

module.exports = xBrowserSync.API.Config();