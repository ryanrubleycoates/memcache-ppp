/**
 * @file defaults.js
 *
 * Provides default options.
 */

exports.connectionDefaults = function () {
    return {
        host: 'localhost',
        port: '11211',
        reconnect: true,
        maxValueSize: 1048576
    };
};

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
