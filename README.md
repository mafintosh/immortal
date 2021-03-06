#immortal

**Immortal creates node deamons without using native code.**

> Most tools used to create deamons use native code, this adds complexity because
> they need to be compilede and node is not very frindly when using fork(2).
>
> This module aims to be a simple API used to create deamons without using native
> code. It is the authors hope that other deamon modules will abstract upon this,
> so the never ending deamon problem can be solved.

## Supported by

|              | **Mac OS X**        | **Linux**           | **Windows**        |
|-------------:|:-------------------:|:-------------------:|:------------------:|
| **node 0.7** | testsuite: 187/187  | testsuite: 187/187  | testsuite: 187/187 |
| **node 0.6** | testsuite: 187/187* | testsuite: 187/187* | testsuite: 187/187 |
| **node 0.4** | manual confirmed*   | manual confirmed*   | never              |

> Please note that the testsuite in node 0.4 don't work because of the module dependencies
> immortal is only roughly tested in this environment.
>
> _*Okay so I will be honest in some situations a binary prebuild subroutine is used however
> this has nothing to do with node, so there shouldn't be any issues. If there are please
> file an issue._

## Installation

```sheel
npm install immortal
```

## How to use

To start a new process simply use: `immortal.start(file, [options], callback)`.

This function will start a new process, but unlike the `.spawn()` or `.fork()` method
given by node core, the new process will be by default be detached from its parent. And
a monitor process will keep track of it instead. This allow the parent to die graceful.

The `callback` is executed when a function argument or option is found invalid or
when the process is executed and property deattached from its parent if necessary.

The function takes an optional `options` argument there can contain the following properties:

|                  | **type** | **description**                                                                    | **default**              |
|-----------------:|:---------|:-----------------------------------------------------------------------------------|:-------------------------|
| **args**         | Array    | the arguments the new process will be executed with.                               | `[]`                     |
| **exec**         | Filepath | the file there will be executed                                                    | `process.execPath`       |
| **env**          | Object   | the envorment the new process will run in.                                         | `process.env`            |
| **stategy**      | String   | this can be `development`, `unattached` or `daemon`.                               | `unattached`             |
| **monitor**      | Filepath | filepath to monitor module.                                                        | very simple monitor file |
| **options**      | Object   | extra options parsed to the monitor object.                                        | `{}`                     |
| **auto**         | Boolean  | when `true` the child will auto restart when it dies.                              | `true`                   |
| **relay**        | Boolean  | when `true` output from process writen to the parent, `development` strategy only. | `true`                   |
| **bufferLength** | Number   |the maximal size of the error buffer in the daemon process                          | `1048576` Byte or `1 MB` |

When useing the default monitor, you should set the following `options`:

|                  | **type** | **description**                                                                    | **default**              |
|-----------------:|:---------|:-----------------------------------------------------------------------------------|:-------------------------|
| **pidFile**      | Filepath | Path to a JSON pid file, there contains a daemon, monitor and process properties.  | error                    |
| **output**       | Filepath | All process stdout and stderr output including downtime logs will be stored here.  | error                    |

The default monitor option properties can also be set to `null`, in that case there will be no file.

An very simple example using the build in monitor to start a daemon:

```JavaScript
var immortal = require('immortal');
var child = immortal.start('process.js', {
  strategy: 'daemon',
  options: {
    output: './output.log',
    pidFile: './output.pid'
  }
}, function (err) {
  if (err) throw err;

  console.log('process started');
});
```

## Strategy

This module alow you to execute a process in 3 ways, the complexity of the strategy
increases from `development`, `unattached` and to `daemon`.

The basic stategy is that `pump` spawn a `process` and keep it alive. The output from the
`process` is also relayed to a `Monitor` object there is `required` from the `pump`.

### Development

The pump is spawned directly from the `parent` and the output from both `pump` and `process`
is relayed to the `parents` `stdout` and `stderr` channel.

![Development](/AndreasMadsen/immortal/raw/master/docs/Development.png)

### Unattached

The `parent` will spawn an `execute` process there will simply execute another process and
kill itself immediately after. The process executed by `execute` is in this case the pump.
Because the `pump` is unattached the output from the `process` will only be relayed to the
`monitor`.

![Unattched](/AndreasMadsen/immortal/raw/master/docs/Unattched.png)

### Daemon

This parent will spawn an unattached `daemon` process there will spawn a `pump` process
and keep it alive. `stderr` output from the `pump` will be stored in the `daemons` memory
and is only send to the `monitor` through the `pump` when the `pump` respawn.

In case the `daemon` should die the `pump` will execute a new `daemon` and kill itself.
This will result in a new `pump` and `process`.

![Daemon](/AndreasMadsen/immortal/raw/master/docs/Daemon.png)

## Monitor

### The basic layout

When createing a monitor object you should keep a stateless design in mind.
This means you shouldn't depend on files or databases beigin properly closed.

The monitor object should also **not** contain any `process.on('uncaughtException')`
since you can't be sure if any I/O will perform as expected after this has emitted.
And the monitor will respawn with the failure string send to it immediately after.

The monitor file itself is a module file there should return a `Monitor` constructor
there inherts from a monitor abstaction class.

```JavaScript
var util = require('util');
var immortal = require('immortal');

function Monitor() {
  immortal.MonitorAbstract.apply(this, arguments);
}
util.inherits(Monitor, immortal.MonitorAbstract);
exports.Monitor = Monitor;
```

When the `Monitor` constrcutor is called it will by default have:

* `this.options` the optional `options` object set in `immortal.start`
* `this.ready` call this function when you are ready to receive data
* `this.stdout` a readable stream relayed from `process.stdout`
* `this.stderr` a readable stream relayed from `process.stderr`
* `this.error` in case the monitor was restarted all `stderr` output
   from prevouse `pump` process is contained in this property.
* `this.pid` an object containing pid information about the immortal group.
* `this.settings` an object containg the properties `exec`, `file`, `args`, and `env`
   descriping how the child process has been exeuted.
* `this.strategy` contain the strategy option.

Note that both `.stdout` and `stderr` can't be closed because they don't origin from
a single process.

Extended version of previous example:

```JavaScript
var fs = require('fs');
function Monitor() {
  immortal.MonitorAbstract.apply(this, arguments);
  var self = this;

  var output = fs.createWriteStream(this.options.output);
  output.on('open', function () {
    if (self.error) {
      output.write("=== An error has occurred in the monitor === ");
      output.write(self.error);
      output.write("=== end error log ===");
    }
    self.ready();
  });

  this.stderr.pipe(output);
  this.stdout.pipe(output);

  // we save the output for later use
  this.output = output;
}
```

### Options check

Because it is better to catch errors before the daemon start a `check` function should
also be provided. If no `check` function exist it will simply be skipped.

```JavaScript
var fs = require('fs');
exports.check = function (options, callback) {
  fs.exists(options.output, function (exist) {
    if (exist) {
      return callback(null);
    }
    return callback(new Error("the output file must already exist"));
  });
};
```

### Monitor events

There are 3 events `daemon`, `monitor` or `process`, they will emit when something
happen with the relevant process. The event handlers are executed with a state argument
there can be either `start`, `restart` or `stop`.

Not all events support all states, this table show what's supported.

|             | **daemon** | **monitor** | **process** |
|------------:|:----------:|:-----------:|:-----------:|
|   **start** |     x      |      x      |      x      |
| **restart** |     x      |      x      |      x      |
|    **stop** |            |             |      x      |

Note when starting a new process using `immortal.start` the events will only be emitted with
the `start` state once since anything else will be a restart.

Exended the `Monitor` constructor to log events:

```JavaScript
  var log = function (type) {
    return function (state) {
      output.write(type + ' : ' + state);
    };
  };

  this.on('process', log('process'));
  this.on('monitor', log('monitor'));
  this.on('daemon', log('daemon'));
```

### Process interaction

#### process pid

The `this.pid` is an object containing information about the `pids` the OS
has assigned to each process in the immortal group. The properties are named
as with the monitor events:

Extend the prevouse log function:

```JavaScript
  var log = function (type) {
    return function (state) {
      output.write(type + '#' + self.pid[type] + ' : ' + state);
    };
  };

  this.on('process', log('process'));
  this.on('monitor', log('monitor'));
  this.on('daemon', log('daemon'));
```

Note that if no pid exist the value will be null. For instance `process` will be null
becore it is spawned and `daemon` will be null if the daemon strategy isn't used.

#### shutdown process group

Immortal start the deamon and all the other nessarry in a new session. This deattach
them totally from the parent there called `immortal.start`, so when killing the immortal
process group the parent is not affected. However the Monitor can also shutdown by
executeing `this.shutdown([callback])` from the Monitor. When executeing this function
a `SIGTERM` signal is send to every process in the group and nothing will restart.

#### restart child process

To restart the child process manually use `this.restart()`. This can be used
to take control of the restart strategy if it is used in combination with `auto`
setting set to `false`.

##License

**The software is license under "MIT"**

> Copyright (c) 2012 Andreas Madsen
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.
