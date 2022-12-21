/**
 * @file Main file for the Memcache Client
 */

var debug = require('debug')('memcache-plus:client');

var misc = require('./misc'),
    Promise = require('bluebird'),
    Immutable = require('immutable'),
    defaultOpts = require('./defaults');

var Connection = require('./connection');

function validateKey(key, operation) {
    misc.assert(key, 'Cannot "' + operation + '" without key!');
    misc.assert(typeof key === 'string', 'Key needs to be of type "string"');
    misc.assert(Buffer.byteLength(key) < 250, 'Key must be less than 250 characters long');
    misc.assert(key.length < 250, 'Key must be less than 250 characters long');
    misc.assert(!/[\x00-\x20]/.test(key), 'Key must not include control characters or whitespace');
}

/**
 * Constructor - Initiate client
 */
function Client(opts) {
    if (!(this instanceof Client)) {
        return new Client(opts);
    }

    // If single connection provided, array-ify it
    if (typeof opts === 'string') {
        opts = { hosts: [opts] };
    } else if (Array.isArray(opts)) {
        opts = { hosts: opts };
    }

    var options = misc.defaults(opts, defaultOpts.clientDefaults());
    Object.assign(this, options);

    if (this.queue) {
        this.buffer = new Immutable.List();
    }

    debug('Connect options', options);
    this.connect();
}

/**
 * connect() - Iterate over all hosts, connect to each.
 *
 * @api private
 */
Client.prototype.connect = function() {
    debug('starting connection');
    // Ryan Rubley - just keep an array of Connection objects
    this.connections = [];
    this.nextConnection = 0;

    if (this.hosts === null) {
        this.hosts = ['localhost:11211'];
    }

    if (this.autodiscover) {
        // First connect to the servers provided
        this.getHostList()
            .bind(this)
            .then(function() {
                debug('got host list, connecting to hosts');
                // Connect to these hosts
                this.connectToHosts();
            });

        // Then get the list of servers

        // Then connect to those
    } else {
        this.connectToHosts();
    }
};

/**
 * disconnect() - Iterate over all hosts, disconnect from each.
 *
 * @api private
 */
Client.prototype.disconnect = function() {
    debug('starting disconnection');

    // Ryan Rubley - disconnect from everything and go back to the state before connect()
    this.connections.forEach(function(connection) {
        // Check that host exists before disconnecting from it
        if (connection !== undefined) {
            debug('disconnecting from %s:%s', connection.host, connection.port);
            connection.disconnect();
        }
    });

    this.connections = undefined;
    this.nextConnection = undefined;

    return Promise.resolve(null);
};

/**
 * getHostList() - Given a list of hosts, contact them via Elasticache
 *   autodiscover and retrieve the list of hosts
 *
 * @api private
 */
Client.prototype.getHostList = function() {

    var client = this;
    var connections = {};
    // Promise.any because we don't care which completes first, as soon as we get
    // a list of hosts we can stop
    return Promise.any(this.hosts.map(function(host) {
        var h = this.splitHost(host);
        var deferred = misc.defer();
        connections[host] = new Connection({
            host: h.host,
            port: h.port,
            netTimeout: this.netTimeout,
            reconnect: false,
            onConnect: function() {
                // Do the autodiscovery, then resolve with hosts
                return deferred.resolve(this.autodiscovery());
            },
            onError: function (err) {
                client.onNetError(err);
                deferred.reject(err);
            }
        });

        return deferred.promise;
    }, this)).bind(this).then(
        function(hosts) {
            this.hosts = hosts;
            this.connectToHosts();
            this.flushBuffer();
        },
        function (err) {
            var wrappedError = new Error('Autodiscovery failed. Errors were:\n' + err.join('\n---\n'));
            this.flushBuffer(wrappedError);
        }
    );
};

/**
 * connectToHosts() - Given a list of hosts, actually connect to them
 *
 * @api private
 */
Client.prototype.connectToHosts = function() {
    debug('connecting to all hosts');
    this.hosts.forEach(function(host) {
        var h = this.splitHost(host);
        var client = this;

        // Connect to host
        // Ryan Rubley - keep each connection in an array
        this.connections.push(new Connection({
            host: h.host,
            port: h.port,
            reconnect: this.reconnect,
            onConnect: function() {
                client.flushBuffer();
            },
            bufferBeforeError: this.bufferBeforeError,
            netTimeout: this.netTimeout,
            onError: this.onNetError,
            maxValueSize: this.maxValueSize
        }));
    }, this);
};

/**
 * flushBuffer() - Flush the current buffer of commands, if any
 *
 * @api private
 */
Client.prototype.flushBuffer = function(err) {
    this.bufferedError = err;

    if (this.buffer && this.buffer.size > 0) {
        debug('flushing client write buffer');
        // @todo Watch out for and handle how this behaves with a very long buffer
        while(this.buffer.size > 0) {
            var item = this.buffer.first();
            this.buffer = this.buffer.shift();

            // Something bad happened before things got a chonce to run. We
            // need to cancel all pending operations.
            if (err) {
                item.deferred.reject(err);
                continue;
            }

            // Ryan Rubley - just cycle through each connection in order
            var connection = this.connections[this.nextConnection];
            this.nextConnection += 1;
            if (this.nextConnection >= this.connections.length) {
                this.nextConnection = 0;
            }

            var promise = connection[item.cmd].apply(connection, item.args);
            promise.then(item.deferred.resolve, item.deferred.reject);
        }
    }
};

/**
 * splitHost() - Helper to split a host string into port and host
 *
 * @api private
 */
Client.prototype.splitHost = function(str) {
    var host = str.split(':');

    if (host.length === 1 && host.indexOf(':') === -1) {
        host.push('11211');
    } else if (host[0].length === 0) {
        host[0] = 'localhost';
    }
    return {
        host: host[0],
        port: host[1]
    };
};

/**
 * ready() - Predicate function, returns true if Client is ready, false otherwise.
 *   Client is ready when all of its connections are open and ready. If autodiscovery
 *   is enabled, Client is ready once it has contacted Elasticache and then initialized
 *   all of the connections
 */
Client.prototype.ready = function() {
    // Ryan Rubley - check each one in the array
    if (!this.connections || this.connections.length < 1) {
        return false;
    } else {
        return this.connections.every(function(connection) {
            return connection.ready;
        }, this);
    }
};

/**
 * delete() - Delete an item from the cache
 *
 * @param {String} key - The key of the item to delete
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
Client.prototype.delete = function(key, cb) {
    validateKey(key, 'delete');

    return this.run('delete', [key], cb);
};

/**
 * deleteMulti() - Delete multiple items from the cache
 *
 * @param {Array} keys - The keys of the items to delete
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
Client.prototype.deleteMulti = function(keys, cb) {
    var self = this;
    misc.assert(keys, 'Cannot delete without keys!');

    return Promise.props(keys.reduce(function(acc, key) {
        validateKey(key, 'deleteMulti');
        acc[key] = self.run('delete', [key], null);
        return acc;
    }, {})).nodeify(cb);
};

/**
 * set() - Set a value for the provided key
 *
 * @param {String} key - The key to set
 * @param {*} value - The value to set for this key. Can be of any type
 * @param {Number|Object|Function} [ttl = 0] - The time to live for this key or callback
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
Client.prototype.set = function(key, val, ttl, cb) {
    validateKey(key, 'set');

    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
    }

    return this.run('set', [key, val, ttl], cb);
};

/**
 * cas() - Set a value for the provided key if the CAS value matches
 *
 * @param {String} key - The key to set
 * @param {*} value - The value to set for this key. Can be of any type
 * @param {String} cas - A CAS value returned from a 'gets' call
 * @param {Number|Object|Function} [ttl = 0] - The time to live for this key or callback
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise} with a boolean value indicating if the value was stored (true) or not (false)
 */
Client.prototype.cas = function(key, val, cas, ttl, cb) {
    validateKey(key, 'cas');

    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
    }

    return this.run('cas', [key, val, cas, ttl], cb);
};


/**
 * gets() - Get the value and CAS id for the provided key
 *
 * @param {String} key - The key to get
 * @param {Object} opts - Any options for this request
 * @param {Function} [cb] - The (optional) callback called on completion
 * @returns {Promise} which is an array containing the value and CAS id
 */
Client.prototype.gets = function(key, opts, cb) {
    validateKey(key, 'gets');

    if (typeof opts === 'function' && typeof cb === 'undefined') {
        cb = opts;
        opts = {};
    }

    return this.run('gets', [key, opts], cb);
};

/**
 * get() - Get the value for the provided key
 *
 * @param {String} key - The key to get
 * @param {Object} opts - Any options for this request
 * @param {Function} [cb] - The (optional) callback called on completion
 * @returns {Promise}
 */
Client.prototype.get = function(key, opts, cb) {
    if (typeof opts === 'function' && typeof cb === 'undefined') {
        cb = opts;
        opts = {};
    }

    if (Array.isArray(key)) {
        return this.getMulti(key, opts, cb);
    } else {
        validateKey(key, 'get');
        return this.run('get', [key, opts], cb);
    }
};

/**
 * getMulti() - Get multiple values for the provided array of keys
 *
 * @param {Array} keys - The keys to get
 * @param {Function} [cb] - The value to set for this key. Can be of any type
 * @returns {Promise}
 */
Client.prototype.getMulti = function(keys, opts, cb) {
    var self = this;
    misc.assert(keys, 'Cannot get without key!');

    if (typeof opts === 'function' && typeof cb === 'undefined') {
        cb = opts;
        opts = {};
    }

    // Ryan Rubley - connection.js now has getMulti() that handles the array
    // and the read() function will retrieve all the results at once
    keys.forEach(function(key) {
        validateKey(key, 'getMulti');
    });
    return this.run('getMulti', [keys, opts], cb);
};

/**
 * touch() -Touch the provided key
 *
 * @param {String} key - The key to touch
 * @param {Number|Object|Function} [ttl = 0] - The time to live for this key or callback
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
 Client.prototype.touch = function(key, ttl, cb) {
    validateKey(key, 'touch');

    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
    }

    return this.run('touch', [key, ttl], cb);
};

/**
 * gats() - Get And Touch the value and CAS id for the provided key
 *
 * @param {String} key - The key to get and touch
 * @param {Number|Object|Function} [ttl = 0] - The time to live for this key or callback
 * @param {Object} opts - Any options for this request
 * @param {Function} [cb] - The (optional) callback called on completion
 * @returns {Promise} which is an array containing the value and CAS id
 */
 Client.prototype.gats = function(key, ttl, opts, cb) {
    validateKey(key, 'gats');

    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
        opts = {};
    } else if (typeof opts === 'function' && typeof cb === 'undefined') {
        cb = opts;
        opts = {};
    }

    return this.run('gats', [key, ttl, opts], cb);
};

/**
 * gat() - Get And Touch the value for the provided key
 *
 * @param {String} key - The key to get and touch
 * @param {Number|Object|Function} [ttl = 0] - The time to live for this key or callback
 * @param {Object} opts - Any options for this request
 * @param {Function} [cb] - The (optional) callback called on completion
 * @returns {Promise}
 */
Client.prototype.gat = function(key, ttl, opts, cb) {
    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
        opts = {};
    } else if (typeof opts === 'function' && typeof cb === 'undefined') {
        cb = opts;
        opts = {};
    }

    if (Array.isArray(key)) {
        return this.gatMulti(key, ttl, opts, cb);
    } else {
        validateKey(key, 'gat');
        return this.run('gat', [key, ttl, opts], cb);
    }
};

/**
 * gatMulti() - Get And Touch multiple values for the provided array of keys
 *
 * @param {Array} keys - The keys to get and touch
 * @param {Number|Object|Function} [ttl = 0] - The time to live for every key or callback
 * @param {Function} [cb] - The value to set for this key. Can be of any type
 * @returns {Promise}
 */
Client.prototype.gatMulti = function(keys, ttl, opts, cb) {
    var self = this;
    misc.assert(keys, 'Cannot gat without key!');

    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
        opts = {};
    } else if (typeof opts === 'function' && typeof cb === 'undefined') {
        cb = opts;
        opts = {};
    }

    keys.forEach(function(key) {
        validateKey(key, 'gatMulti');
    });
    return this.run('gatMulti', [keys, ttl, opts], cb);
};

/**
 * incr() - Increment a value for the provided key
 *
 * @param {String} key - The key to incr
 * @param {Number|Function} [value = 1] - The value to increment this key by. Must be an integer
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
Client.prototype.incr = function(key, val, cb) {
    validateKey(key, 'incr');

    if (typeof val === 'function' || typeof val === 'undefined') {
        cb = val;
        val = 1;
    }

    misc.assert(typeof val === 'number', 'Cannot incr in memcache with a non number value');

    return this.run('incr', [key, val], cb);
};

/**
 * decr() - Decrement a value for the provided key
 *
 * @param {String} key - The key to decr
 * @param {Number|Function} [value = 1] - The value to decrement this key by. Must be an integer
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
Client.prototype.decr = function(key, val, cb) {
    validateKey(key, 'decr');

    if (typeof val === 'function' || typeof val === 'undefined') {
        cb = val;
        val = 1;
    }

    misc.assert(typeof val === 'number', 'Cannot decr in memcache with a non number value');

    return this.run('decr', [key, val], cb);
};

/**
 * flush() - Removes all stored values
 * @param {Number|Function} [delay = 0] - Delay invalidation by specified seconds
 * @param {Function} [cb] - The (optional) callback called on completion
 * @returns {Promise}
 */
Client.prototype.flush = function (delay, cb) {
    if (typeof delay === 'function' || typeof delay === 'undefined') {
        cb = delay;
        delay = 0;
    }

    return this.run('flush_all', [delay], cb);
};

/**
 * items() - Gets items statistics
 * @param {Function} [cb] - The (optional) callback called on completion
 * @returns {Promise}
 */
Client.prototype.items = function(cb) {
    return this.run('stats items', [], cb);
};

/**
 * add() - Add value for the provided key only if it didn't already exist
 *
 * @param {String} key - The key to set
 * @param {*} value - The value to set for this key. Can be of any type
 * @param {Number|Object|Function} [ttl = 0] - The time to live for this key or callback
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
Client.prototype.add = function(key, val, ttl, cb) {
    validateKey(key, 'add');

    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
    }

    return this.run('add', [key, val, ttl], cb);
};

/**
 * replace() - Replace value for the provided key only if it already exists
 *
 * @param {String} key - The key to replace
 * @param {*} value - The value to replace for this key. Can be of any type
 * @param {Number|Object|Function} [ttl = 0] - The time to live for this key or callback
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
Client.prototype.replace = function(key, val, ttl, cb) {
    validateKey(key, 'replace');

    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
    }

    return this.run('replace', [key, val, ttl], cb);
};

/**
 * append() - Append value for the provided key only if it already exists
 *
 * @param {String} key - The key to append
 * @param {*} value - The value to append for this key. Can be of any type
 * @param {Number|Object|Function} [ttl = 0] - The time to live for this key or callback
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
Client.prototype.append = function(key, val, ttl, cb) {
    validateKey(key, 'append');

    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
    }

    return this.run('append', [key, val, ttl], cb);
};

/**
 * prepend() - Prepend value for the provided key only if it already exists
 *
 * @param {String} key - The key to prepend
 * @param {*} value - The value to prepend for this key. Can be of any type
 * @param {Number|Object|Function} [ttl = 0] - The time to live for this key or callback
 * @param {Function} [cb] - Callback to call when we have a value
 * @returns {Promise}
 */
Client.prototype.prepend = function(key, val, ttl, cb) {
    validateKey(key, 'prepend');

    if (typeof ttl === 'function') {
        cb = ttl;
        ttl = 0;
    }

    return this.run('prepend', [key, val, ttl], cb);
};

/**
 * cachedump() - get cache information for a given slabs id
 * @param {number} slabsId
 * @param {number} [limit] Limit result to number of entries. Default is 0 (unlimited).
 * @param {Function} [cb] - The (optional) callback called on completion
 * @returns {Promise}
 */
Client.prototype.cachedump = function(slabsId, limit, cb) {
    misc.assert(slabsId, 'Cannot cachedump without slabId!');

    if (typeof limit === 'function' || typeof limit === 'undefined') {
        cb = limit;
        limit = 0;
    }

    return this.run('stats cachedump', [slabsId, limit], cb);
};

/**
 * version() - Get current Memcached version from the server
 * @param {Function} [cb] - The (optional) callback called on completion
 * @returns {Promise}
 */
Client.prototype.version = function(cb) {
    return this.run('version', [], cb);
};

/**
 * run() - Run this command on the appropriate connection. Will buffer command
 *   if connection(s) are not ready
 *
 * @param {String} command - The command to run
 * @param {Array} args - The arguments to send with this command
 * @returns {Promise}
 */
Client.prototype.run = function(command, args, cb) {
    if (this.disabled) {
        return Promise.resolve(null).nodeify(cb);
    }

    if (this.ready()) {
        // Ryan Rubley - just cycle through each connection in order
        var connection = this.connections[this.nextConnection];
        this.nextConnection += 1;
        if (this.nextConnection >= this.connections.length) {
            this.nextConnection = 0;
        }

        // Run this command
        return connection[command].apply(connection, args).nodeify(cb);
    } else if (this.bufferBeforeError === 0 || !this.queue) {
        return Promise.reject(new Error('Connection is not ready, either not connected yet or disconnected')).nodeify(cb);
    } else if (this.bufferedError) {
        return Promise.reject(this.bufferedError).nodeify(cb);
    } else {
        var deferred = misc.defer(args[0]);

        this.buffer = this.buffer.push({
            cmd: command,
            args: args,
            key: args[0],
            deferred: deferred
        });

        return deferred.promise.nodeify(cb);
    }
};

module.exports = Client;
