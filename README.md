utils

## config

env -> overwrite -> secret file -> overwrite -> initial config -> overwrite -> default config

## procedure

-> require

`const { Framework } = require("backend-core");`

-> configure settings

`let fw = new Framework(settings);`

-> further manual setup

`fw.scheduleJob();`

`fw.listen();`

-> assign tasks for each section

`fw.perform("pre-process" | "process" | "post-process" | "pre-terminate",()=>{})`

-> start

`fw.run()`

## running sequence

-> sys - initialization

-> user -> perform["pre-process"]

-> sys - serveStatic - schedule

-> user -> perform["process"]

-> sys - handle404

-> user -> perform["post-process"]

-> sys - listenOnPort

-> user -> perform["pre-terminate"] (only run once before app terminates)
