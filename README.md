# Memcache ++

Memcache ++ Memcache module for Node js. Formerly forked from memcache-plus.

## What makes it "Plus"?

* Native support for Promises or Callbacks
* Elasticache auto discovery baked in
* Actively developed and used
* Focus on cleanliness and simplicity
* Command buffering - start issuing commands right away, *memcache-plus* will automatically wait until connected then flush that buffer
* Ability to disable with just a flag on init - sounds trivial, but nice to test with memcache off without altering any of your code
* Compression built in on a per item basis
* Cached retrieve (*coming soon!*) - simply pass a function for retrieving a value and a key and memcache-plus will do the whole "check key, if it exists return it, if not run the function to retrieve it, set the value, and return it" for you
* Support for binaries (*coming soon!*) which the other memcache libraries for Node don't support

Memcache-plus proudly developed in Washington, D.C. by SocialRadar.
