# Memcache Plus Plus Plus

Memcache Plus Plus Plus - Bettererer Memcache module for Node js.
Forked from the memcache-pp module, which was forked from memcache-plus,
so you can find many refs to the memcache-plus in the docs or code itself.

## What's new in "Plus Plus Plus" over "Plus Plus" and the original "Plus"?

* Removed hashring and replaced it with a simple cycle through each host
* Fixed uncaught exception errors when retrieving certain data values
* Support multiline/empty string/values where the data is a keyword (such as END) properly
* Added missing touch/gat/gats commands
* getMulti/gatMulti send one one command to request all keys at once instead of a loop of many requests
* Fixed potential race condition when using 2+ hosts requesting the same key at the same time

## Use unix sockets (33% faster than TCP)

Edit your `/etc/memcached.conf` and comment out / add lines such as:

```
# -p 11211
# -l 127.0.0.1
-s /var/run/memcached/memcached.sock
-a 777
```

Then use in your code with:

```
import MemcachePlus from 'memcache-ppp';
const memcache = new MemcachePlus({ "hosts": ["/var/run/memcached/memcached.sock:0"] });
```

## Use Gets/Cas

```
const [value, cas] = await memcache.gets('key');
if (!await memcache.cas('key', 'newvalue', cas)) {
  // value changed between our gets() and cas() calls
}
```

## Touch and Gat/Gats

```
memcache.touch(key, ttl);
memcache.gat(key, ttl, opts);
memcache.gats(key, ttl, opts);
```

## Why remove hashring?

* Many people use only a single server on localhost, or a unix socket, making it pointless anyway
* It is CPU intensive to calculate a MD5 hash of every key for every operation
* Hashring's internal cache grows up to several GB of RAM in less than a day

## What makes it "Plus"?

* Native support for Promises or Callbacks
* Elasticache auto discovery baked in
* Actively developed and used
* Focus on cleanliness and simplicity
* Command buffering - start issuing commands right away, *memcache-plus* will automatically wait until connected then flush that buffer
* Ability to disable with just a flag on init - sounds trivial, but nice to test with memcache off without altering any of your code
* Compression built in on a per item basis
* ~~Cached retrieve (*coming soon!*) - simply pass a function for retrieving a value and a key and memcache-plus will do the whole "check key, if it exists return it, if not run the function to retrieve it, set the value, and return it" for you~~
* ~~Support for binaries (*coming soon!*) which the other memcache libraries for Node don't support~~
* (these things are not coming here)
