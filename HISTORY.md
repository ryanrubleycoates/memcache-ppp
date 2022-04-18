# 0.4.0 (2022-04-19) (memcache-ppp)

  * Forked from memcache-pp 0.3.3
  * Fixed uncaught exception errors when retrieving certain data values
  * Support multiline/empty string/values where the data is a keyword (such as END) properly
  * Added missing touch/gat/gats commands
  * getMulti/gatMulti send one one command to request all keys at once instead of a loop of many requests
  * Fixed potential race condition when using 2+ hosts requesting the same key at the same time

# 0.3.3 (2021-02-08) (memcache-pp)

  * Forked from memcached-plus 0.2.22
  * Removed ramda and lodash dependencies.
  * Add support for Unix socket connection.
  * Fixed tests(cachedump could fail in some cases).
  * Made lib and tests code lighter.
  * Removed spare deffered.key = key lines.
