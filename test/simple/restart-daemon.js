/**
 * Copyright (c) 2012 Andreas Madsen
 * MIT License
 */

var vows = require('vows'),
    assert = require('assert'),

    common = require('../common.js'),
    prope = require(common.watcher('interface.js'));

var preOption = {
  strategy: 'daemon',
  auto: false
};

function startImmortal(callback) {
  prope.createInterface(common.fixture('longlive.js'), preOption, callback);
}

var monitor = null;
vows.describe('testing daemon restart with auto:false').addBatch({

  'when creating the immortal group': {
    topic: function () {
      var self = this;
      startImmortal(function (error, prope) {
        monitor = prope;
        self.callback(error, prope);
      });
    },

    'pid should match alive processors': function (error, monitor) {
      assert.ifError(error);

      // Since montor.ready hasn't been executed
      assert.isNull(monitor.pid.process);

      // The daemon process should be alive
      assert.isNumber(monitor.pid.daemon);
      assert.isTrue(common.isAlive(monitor.pid.daemon));

      // The pump process should be alive
      assert.isNumber(monitor.pid.monitor);
      assert.isTrue(common.isAlive(monitor.pid.monitor));
    }
  }

}).addBatch({

  'when the child process is started': {
    topic: function () {
      monitor.ready();
      this.callback(null, monitor);
    },

    'and daemon event has emitted': {
      topic: function (monitor) {
        var self = this;
        monitor.once('daemon', function (state) {
          self.callback(null, monitor, state);
        });
      },

      'the state argument should be start': function (error, monitor, state) {
        assert.ifError(error);
        assert.equal(state, 'start');
      }
    },

    'and monitor event has emitted': {
      topic: function (monitor) {
        var self = this;
        monitor.once('monitor', function (state) {
          self.callback(null, monitor, state);
        });
      },

      'the state argument should be start': function (error, monitor, state) {
        assert.ifError(error);
        assert.equal(state, 'start');
      }
    },

    'and process event has emitted': {
      topic: function (monitor) {
        var self = this;
        monitor.once('process', function (state) {
          self.callback(null, monitor, state);
        });
      },

      'the pid informations should be updated': function (error, monitor) {
        assert.ifError(error);

        // Since montor.ready hasn't been executed
        assert.isNumber(monitor.pid.process);
        assert.isTrue(common.isAlive(monitor.pid.process));

        // The daemon process should be alive
        assert.isNumber(monitor.pid.daemon);
        assert.isTrue(common.isAlive(monitor.pid.daemon));

        // The pump process should be alive
        assert.isNumber(monitor.pid.monitor);
        assert.isTrue(common.isAlive(monitor.pid.monitor));
      },

      'the state argument should be start': function (error, monitor, state) {
        assert.ifError(error);
        assert.equal(state, 'start');
      }
    }
  }

}).addBatch({

  'when the child process stops': {
    topic: function () {
      process.nextTick(function () {
        process.kill(monitor.pid.process, 'SIGTERM');
      });
      this.callback(null, monitor);
    },

    'the process event should emit': {
      topic: function (monitor) {
        var self = this;
        monitor.once('process', function (state) {
          self.callback(null, monitor, state);
        });
      },

      'the state shoud be stop': function (error, monitor, state) {
        assert.ifError(error);
        assert.equal(state, 'stop');
      },

      'the process pid should be null': function (error, monitor) {
        assert.ifError(error);
        assert.isNull(monitor.pid.process);
      },

      'and': {
        topic: function (monitor) {
          var self = this;
          var listen = function (state) {
            self.callback(null, monitor, false, state);
          };
          monitor.once('process', listen);
          setTimeout(function () {
            monitor.removeListener('process', listen);
            self.callback(null, monitor, true, null);
          }, 500);
        },

        'there should be no restart': function (error, monitor, fake, state) {
          assert.ifError(error);
          assert.isTrue(fake);
          assert.isNull(state);
        }
      }
    }
  }

}).addBatch({

  'when the child process restarts manually': {
    topic: function () {
      var self = this;
      monitor.restart();

      monitor.once('process', function (state) {
        self.callback(null, monitor, state);
      });
    },

    'the state should be restart': function (error, monitor, state) {
      assert.ifError(error);
      assert.equal(state, 'restart');
    },

    'the pid information should match': function (error, monitor) {
      assert.ifError(error);
      assert.isNumber(monitor.pid.process);
      assert.isTrue(common.isAlive(monitor.pid.process));
    }
  }

}).addBatch({

  'when the pump process stops': {
    topic: function () {
      var self = this;
      var pids = common.copy(monitor.pid);
      
      setTimeout(function () {
        process.kill(monitor.pid.monitor, 'SIGTERM');
      }, 200);

      monitor.once('reconnect', function () {
        self.callback(null, monitor, pids);
      });
    },

    'the montor RPC sever should restart': function (error, monitor) {
      assert.ifError(error);
    },

    'the daemon process should stil be alive': function (error, monitor, pids) {
      assert.ifError(error);

      assert.isNumber(pids.daemon);
      assert.isTrue(common.isAlive(pids.daemon));
    },

    'the old monitor process should be dead': function (error, monitor, pids) {
      assert.ifError(error);

      assert.isNumber(pids.monitor);
      assert.isFalse(common.isAlive(pids.monitor));
    },

    'the old child process should be dead': function (error, monitor, pids) {
      assert.ifError(error);

      assert.isNumber(pids.process);
      assert.isFalse(common.isAlive(pids.process));
    }
  }

}).addBatch({

  'when montor.ready is executed again': {
    topic: function () {
      monitor.ready();
      this.callback(null, monitor);
    },

    'the process event': {
      topic: function (monitor) {
        var self = this;
        monitor.once('process', function (state) {
          self.callback(null, monitor, state);
        });
      },

      'should emit with a restart state': function (error, monitor, state) {
        assert.ifError(error);
        assert.equal(state, 'restart');
      }
    },

    'the monitor event': {
      topic: function (monitor) {
        var self = this;
        monitor.once('monitor', function (state) {
          self.callback(null, monitor, state);
        });
      },

      'should emit with a restart state': function (error, monitor, state) {
        assert.ifError(error);
        assert.equal(state, 'restart');
      }
    }
  }

}).addBatch({

  'when the daemon process stops': {
    topic: function () {
      var self = this;
      var pids = common.copy(monitor.pid);
      process.nextTick(function () {
        process.kill(monitor.pid.daemon, 'SIGTERM');
      });

      monitor.once('reconnect', function () {
        self.callback(null, monitor, pids);
      });
    },

    'the montor RPC sever should restart': function (error, monitor) {
      assert.ifError(error);
    },

    'the old daemon process should be dead': function (error, monitor, pids) {
      assert.ifError(error);

      assert.isNumber(pids.daemon);
      assert.isFalse(common.isAlive(pids.daemon));
    },

    'the old monitor process should be dead': function (error, monitor, pids) {
      assert.ifError(error);

      assert.isNumber(pids.monitor);
      assert.isFalse(common.isAlive(pids.monitor));
    },

    'the old child process should be dead': function (error, monitor, pids) {
      assert.ifError(error);

      assert.isNumber(pids.process);
      assert.isFalse(common.isAlive(pids.process));
    }
  }

}).addBatch({

  'when montor.ready is executed again': {
    topic: function () {
      monitor.ready();
      this.callback(null, monitor);
    },

    'the daemon event': {
      topic: function (monitor) {
        var self = this;
        monitor.once('daemon', function (state) {
          self.callback(null, monitor, state);
        });
      },

      'should emit with a restart state': function (error, monitor, state) {
        assert.ifError(error);
        assert.equal(state, 'restart');
      }
    },

    'the process event': {
      topic: function (monitor) {
        var self = this;
        monitor.once('process', function (state) {
          self.callback(null, monitor, state);
        });
      },

      'should emit with a restart state': function (error, monitor, state) {
        assert.ifError(error);
        assert.equal(state, 'restart');
      }
    },

    'the monitor event': {
      topic: function (monitor) {
        var self = this;
        monitor.once('monitor', function (state) {
          self.callback(null, monitor, state);
        });
      },

      'should emit with a restart state': function (error, monitor, state) {
        assert.ifError(error);
        assert.equal(state, 'restart');
      }
    }
  }

}).addBatch({

  'when immortal stops': {
    topic: function () {
      var self = this;
      var pids = common.copy(monitor.pid);;
      monitor.shutdown(function () {
        monitor.close(function () {
          setTimeout(function () {
            self.callback(null, monitor, pids);
          }, 500);
        });
      });
    },

    'the immortal group should be dead': function (error, monitor, pid) {
      assert.ifError(error);

      assert.isNumber(pid.daemon);
      assert.isFalse(common.isAlive(pid.daemon));

      assert.isNumber(pid.monitor);
      assert.isFalse(common.isAlive(pid.monitor));

      assert.isNumber(pid.process);
      assert.isFalse(common.isAlive(pid.process));
    }
  }

}).exportTo(module);
