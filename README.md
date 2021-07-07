# koatty_schedule
Schedule for koatty.

Koatty框架的 Scheduled, SchedulerLock, Lock 支持库


# Usage

db.ts in koatty project:

```js
export default {
    ...

    "CacheStore": {
        type: "memory", // redis or memory, memory is default
        // key_prefix: "koatty",
        // host: '127.0.0.1',
        // port: 6379,
        // name: "",
        // username: "",
        // password: "",
        // db: 0,
        // timeout: 30,
        // pool_size: 10,
        // conn_timeout: 30
    },

    ...
};

```

used in service: 

```js
import { Scheduled, SchedulerLock } from "koatty_schedule";

export class TestService {

    @Scheduled("0 * * * * *")
    @SchedulerLock("testCron") //locker
    Test(){
        //todo
    }
}

```