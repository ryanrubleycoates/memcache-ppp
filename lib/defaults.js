/**
 * @file defaults.js
 *
 * Provides default options.
 */

/**
 * connectionDefaults() Default connection options.
 * @returns {Object}
 */
exports.connectionDefaults = function () {
    return {
        host: 'localhost',
        port: '11211',
        reconnect: true,
        maxValueSize: 1048576
    };
};

/**
 * clientDefaults() Default client options.
 * @returns {Object}
 */
exports.clientDefaults = function () {
    return {
        autodiscover: false,
        bufferBeforeError: 1000,
        disabled: false,
        hosts: null,
        reconnect: true,
        onNetError: function onNetError(err) { console.error(err); },
        queue: true,
        netTimeout: 500,
        backoffLimit: 10000,
        maxValueSize: 1048576
    };
};
