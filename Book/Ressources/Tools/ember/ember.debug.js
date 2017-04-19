;(function() {
/*!
 * @overview  Ember - JavaScript Application Framework
 * @copyright Copyright 2011-2016 Tilde Inc. and contributors
 *            Portions Copyright 2006-2011 Strobe Inc.
 *            Portions Copyright 2008-2011 Apple Inc. All rights reserved.
 * @license   Licensed under MIT license
 *            See https://raw.github.com/emberjs/ember.js/master/LICENSE
 * @version   2.10.0
 */

var enifed, requireModule, Ember;
var mainContext = this;

(function() {
  var isNode = typeof window === 'undefined' &&
    typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

  if (!isNode) {
    Ember = this.Ember = this.Ember || {};
  }

  if (typeof Ember === 'undefined') { Ember = {}; }

  if (typeof Ember.__loader === 'undefined') {
    var registry = {};
    var seen = {};

    enifed = function(name, deps, callback) {
      var value = { };

      if (!callback) {
        value.deps = [];
        value.callback = deps;
      } else {
        value.deps = deps;
        value.callback = callback;
      }

      registry[name] = value;
    };

    requireModule = function(name) {
      return internalRequire(name, null);
    };

    // setup `require` module
    requireModule['default'] = requireModule;

    requireModule.has = function registryHas(moduleName) {
      return !!registry[moduleName] || !!registry[moduleName + '/index'];
    };

    function missingModule(name, referrerName) {
      if (referrerName) {
        throw new Error('Could not find module ' + name + ' required by: ' + referrerName);
      } else {
        throw new Error('Could not find module ' + name);
      }
    }

    function internalRequire(_name, referrerName) {
      var name = _name;
      var mod = registry[name];

      if (!mod) {
        name = name + '/index';
        mod = registry[name];
      }

      var exports = seen[name];

      if (exports !== undefined) {
        return exports;
      }

      exports = seen[name] = {};

      if (!mod) {
        missingModule(_name, referrerName);
      }

      var deps = mod.deps;
      var callback = mod.callback;
      var reified = new Array(deps.length);

      for (var i = 0; i < deps.length; i++) {
        if (deps[i] === 'exports') {
          reified[i] = exports;
        } else if (deps[i] === 'require') {
          reified[i] = requireModule;
        } else {
          reified[i] = internalRequire(deps[i], name);
        }
      }

      callback.apply(this, reified);

      return exports;
    }

    requireModule._eak_seen = registry;

    Ember.__loader = {
      define: enifed,
      require: requireModule,
      registry: registry
    };
  } else {
    enifed = Ember.__loader.define;
    requireModule = Ember.__loader.require;
  }
})();

var babelHelpers;

function classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError('Cannot call a class as a function');
  }
}

function inherits(subClass, superClass) {
  if (typeof superClass !== 'function' && superClass !== null) {
    throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass);
  }

  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });

  if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : defaults(subClass, superClass);
}

function taggedTemplateLiteralLoose(strings, raw) {
  strings.raw = raw;
  return strings;
}

function defineProperties(target, props) {
  for (var i = 0; i < props.length; i++) {
    var descriptor = props[i];
    descriptor.enumerable = descriptor.enumerable || false;
    descriptor.configurable = true;
    if ('value' in descriptor) descriptor.writable = true;
    Object.defineProperty(target, descriptor.key, descriptor);
  }
}

function createClass(Constructor, protoProps, staticProps) {
  if (protoProps) defineProperties(Constructor.prototype, protoProps);
  if (staticProps) defineProperties(Constructor, staticProps);
  return Constructor;
}

function interopExportWildcard(obj, defaults) {
  var newObj = defaults({}, obj);
  delete newObj['default'];
  return newObj;
}

function defaults(obj, defaults) {
  var keys = Object.getOwnPropertyNames(defaults);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = Object.getOwnPropertyDescriptor(defaults, key);
    if (value && value.configurable && obj[key] === undefined) {
      Object.defineProperty(obj, key, value);
    }
  }
  return obj;
}

babelHelpers = {
  classCallCheck: classCallCheck,
  inherits: inherits,
  taggedTemplateLiteralLoose: taggedTemplateLiteralLoose,
  slice: Array.prototype.slice,
  createClass: createClass,
  interopExportWildcard: interopExportWildcard,
  defaults: defaults
};

enifed('backburner', ['exports'], function (exports) { 'use strict';

var NUMBER = /\d+/;

function each(collection, callback) {
  for (var i = 0; i < collection.length; i++) {
    callback(collection[i]);
  }
}

function isString(suspect) {
  return typeof suspect === 'string';
}

function isFunction(suspect) {
  return typeof suspect === 'function';
}

function isNumber(suspect) {
  return typeof suspect === 'number';
}

function isCoercableNumber(number) {
  return isNumber(number) || NUMBER.test(number);
}

function binarySearch(time, timers) {
  var start = 0;
  var end = timers.length - 2;
  var middle, l;

  while (start < end) {
    // since timers is an array of pairs 'l' will always
    // be an integer
    l = (end - start) / 2;

    // compensate for the index in case even number
    // of pairs inside timers
    middle = start + l - (l % 2);

    if (time >= timers[middle]) {
      start = middle + 2;
    } else {
      end = middle;
    }
  }

  return (time >= timers[start]) ? start + 2 : start;
}

function Queue(name, options, globalOptions) {
  this.name = name;
  this.globalOptions = globalOptions || {};
  this.options = options;
  this._queue = [];
  this.targetQueues = {};
  this._queueBeingFlushed = undefined;
}

Queue.prototype = {
  push: function(target, method, args, stack) {
    var queue = this._queue;
    queue.push(target, method, args, stack);

    return {
      queue: this,
      target: target,
      method: method
    };
  },

  pushUniqueWithoutGuid: function(target, method, args, stack) {
    var queue = this._queue;

    for (var i = 0, l = queue.length; i < l; i += 4) {
      var currentTarget = queue[i];
      var currentMethod = queue[i+1];

      if (currentTarget === target && currentMethod === method) {
        queue[i+2] = args;  // replace args
        queue[i+3] = stack; // replace stack
        return;
      }
    }

    queue.push(target, method, args, stack);
  },

  targetQueue: function(targetQueue, target, method, args, stack) {
    var queue = this._queue;

    for (var i = 0, l = targetQueue.length; i < l; i += 2) {
      var currentMethod = targetQueue[i];
      var currentIndex  = targetQueue[i + 1];

      if (currentMethod === method) {
        queue[currentIndex + 2] = args;  // replace args
        queue[currentIndex + 3] = stack; // replace stack
        return;
      }
    }

    targetQueue.push(
      method,
      queue.push(target, method, args, stack) - 4
    );
  },

  pushUniqueWithGuid: function(guid, target, method, args, stack) {
    var hasLocalQueue = this.targetQueues[guid];

    if (hasLocalQueue) {
      this.targetQueue(hasLocalQueue, target, method, args, stack);
    } else {
      this.targetQueues[guid] = [
        method,
        this._queue.push(target, method, args, stack) - 4
      ];
    }

    return {
      queue: this,
      target: target,
      method: method
    };
  },

  pushUnique: function(target, method, args, stack) {
    var KEY = this.globalOptions.GUID_KEY;

    if (target && KEY) {
      var guid = target[KEY];
      if (guid) {
        return this.pushUniqueWithGuid(guid, target, method, args, stack);
      }
    }

    this.pushUniqueWithoutGuid(target, method, args, stack);

    return {
      queue: this,
      target: target,
      method: method
    };
  },

  invoke: function(target, method, args /*, onError, errorRecordedForStack */) {
    if (args && args.length > 0) {
      method.apply(target, args);
    } else {
      method.call(target);
    }
  },

  invokeWithOnError: function(target, method, args, onError, errorRecordedForStack) {
    try {
      if (args && args.length > 0) {
        method.apply(target, args);
      } else {
        method.call(target);
      }
    } catch(error) {
      onError(error, errorRecordedForStack);
    }
  },

  flush: function(sync) {
    var queue = this._queue;
    var length = queue.length;

    if (length === 0) {
      return;
    }

    var globalOptions = this.globalOptions;
    var options = this.options;
    var before = options && options.before;
    var after = options && options.after;
    var onError = globalOptions.onError || (globalOptions.onErrorTarget &&
                                            globalOptions.onErrorTarget[globalOptions.onErrorMethod]);
    var target, method, args, errorRecordedForStack;
    var invoke = onError ? this.invokeWithOnError : this.invoke;

    this.targetQueues = Object.create(null);
    var queueItems = this._queueBeingFlushed = this._queue.slice();
    this._queue = [];

    if (before) {
      before();
    }

    for (var i = 0; i < length; i += 4) {
      target                = queueItems[i];
      method                = queueItems[i+1];
      args                  = queueItems[i+2];
      errorRecordedForStack = queueItems[i+3]; // Debugging assistance

      if (isString(method)) {
        method = target[method];
      }

      // method could have been nullified / canceled during flush
      if (method) {
        //
        //    ** Attention intrepid developer **
        //
        //    To find out the stack of this task when it was scheduled onto
        //    the run loop, add the following to your app.js:
        //
        //    Ember.run.backburner.DEBUG = true; // NOTE: This slows your app, don't leave it on in production.
        //
        //    Once that is in place, when you are at a breakpoint and navigate
        //    here in the stack explorer, you can look at `errorRecordedForStack.stack`,
        //    which will be the captured stack when this job was scheduled.
        //
        //    One possible long-term solution is the following Chrome issue:
        //       https://bugs.chromium.org/p/chromium/issues/detail?id=332624
        //
        invoke(target, method, args, onError, errorRecordedForStack);
      }
    }

    if (after) {
      after();
    }

    this._queueBeingFlushed = undefined;

    if (sync !== false &&
        this._queue.length > 0) {
      // check if new items have been added
      this.flush(true);
    }
  },

  cancel: function(actionToCancel) {
    var queue = this._queue, currentTarget, currentMethod, i, l;
    var target = actionToCancel.target;
    var method = actionToCancel.method;
    var GUID_KEY = this.globalOptions.GUID_KEY;

    if (GUID_KEY && this.targetQueues && target) {
      var targetQueue = this.targetQueues[target[GUID_KEY]];

      if (targetQueue) {
        for (i = 0, l = targetQueue.length; i < l; i++) {
          if (targetQueue[i] === method) {
            targetQueue.splice(i, 1);
          }
        }
      }
    }

    for (i = 0, l = queue.length; i < l; i += 4) {
      currentTarget = queue[i];
      currentMethod = queue[i+1];

      if (currentTarget === target &&
          currentMethod === method) {
        queue.splice(i, 4);
        return true;
      }
    }

    // if not found in current queue
    // could be in the queue that is being flushed
    queue = this._queueBeingFlushed;

    if (!queue) {
      return;
    }

    for (i = 0, l = queue.length; i < l; i += 4) {
      currentTarget = queue[i];
      currentMethod = queue[i+1];

      if (currentTarget === target &&
          currentMethod === method) {
        // don't mess with array during flush
        // just nullify the method
        queue[i+1] = null;
        return true;
      }
    }
  }
};

function DeferredActionQueues(queueNames, options) {
  var queues = this.queues = {};
  this.queueNames = queueNames = queueNames || [];

  this.options = options;

  each(queueNames, function(queueName) {
    queues[queueName] = new Queue(queueName, options[queueName], options);
  });
}

function noSuchQueue(name) {
  throw new Error('You attempted to schedule an action in a queue (' + name + ') that doesn\'t exist');
}

function noSuchMethod(name) {
  throw new Error('You attempted to schedule an action in a queue (' + name + ') for a method that doesn\'t exist');
}

DeferredActionQueues.prototype = {
  schedule: function(name, target, method, args, onceFlag, stack) {
    var queues = this.queues;
    var queue = queues[name];

    if (!queue) {
      noSuchQueue(name);
    }

    if (!method) {
      noSuchMethod(name);
    }

    if (onceFlag) {
      return queue.pushUnique(target, method, args, stack);
    } else {
      return queue.push(target, method, args, stack);
    }
  },

  flush: function() {
    var queues = this.queues;
    var queueNames = this.queueNames;
    var queueName, queue;
    var queueNameIndex = 0;
    var numberOfQueues = queueNames.length;

    while (queueNameIndex < numberOfQueues) {
      queueName = queueNames[queueNameIndex];
      queue = queues[queueName];

      var numberOfQueueItems = queue._queue.length;

      if (numberOfQueueItems === 0) {
        queueNameIndex++;
      } else {
        queue.flush(false /* async */);
        queueNameIndex = 0;
      }
    }
  }
};

function Backburner(queueNames, options) {
  this.queueNames = queueNames;
  this.options = options || {};
  if (!this.options.defaultQueue) {
    this.options.defaultQueue = queueNames[0];
  }
  this.instanceStack = [];
  this._debouncees = [];
  this._throttlers = [];
  this._eventCallbacks = {
    end: [],
    begin: []
  };

  var _this = this;
  this._boundClearItems = function() {
    clearItems();
  };

  this._timerTimeoutId = undefined;
  this._timers = [];

  this._platform = this.options._platform || {
    setTimeout: function (fn, ms) {
      return setTimeout(fn, ms);
    },
    clearTimeout: function (id) {
      clearTimeout(id);
    }
  };

  this._boundRunExpiredTimers = function () {
    _this._runExpiredTimers();
  };
}

Backburner.prototype = {
  begin: function() {
    var options = this.options;
    var onBegin = options && options.onBegin;
    var previousInstance = this.currentInstance;

    if (previousInstance) {
      this.instanceStack.push(previousInstance);
    }

    this.currentInstance = new DeferredActionQueues(this.queueNames, options);
    this._trigger('begin', this.currentInstance, previousInstance);
    if (onBegin) {
      onBegin(this.currentInstance, previousInstance);
    }
  },

  end: function() {
    var options = this.options;
    var onEnd = options && options.onEnd;
    var currentInstance = this.currentInstance;
    var nextInstance = null;

    // Prevent double-finally bug in Safari 6.0.2 and iOS 6
    // This bug appears to be resolved in Safari 6.0.5 and iOS 7
    var finallyAlreadyCalled = false;
    try {
      currentInstance.flush();
    } finally {
      if (!finallyAlreadyCalled) {
        finallyAlreadyCalled = true;

        this.currentInstance = null;

        if (this.instanceStack.length) {
          nextInstance = this.instanceStack.pop();
          this.currentInstance = nextInstance;
        }
        this._trigger('end', currentInstance, nextInstance);
        if (onEnd) {
          onEnd(currentInstance, nextInstance);
        }
      }
    }
  },

  /**
   Trigger an event. Supports up to two arguments. Designed around
   triggering transition events from one run loop instance to the
   next, which requires an argument for the first instance and then
   an argument for the next instance.

   @private
   @method _trigger
   @param {String} eventName
   @param {any} arg1
   @param {any} arg2
   */
  _trigger: function(eventName, arg1, arg2) {
    var callbacks = this._eventCallbacks[eventName];
    if (callbacks) {
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](arg1, arg2);
      }
    }
  },

  on: function(eventName, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }
    var callbacks = this._eventCallbacks[eventName];
    if (callbacks) {
      callbacks.push(callback);
    } else {
      throw new TypeError('Cannot on() event "' + eventName + '" because it does not exist');
    }
  },

  off: function(eventName, callback) {
    if (eventName) {
      var callbacks = this._eventCallbacks[eventName];
      var callbackFound = false;
      if (!callbacks) return;
      if (callback) {
        for (var i = 0; i < callbacks.length; i++) {
          if (callbacks[i] === callback) {
            callbackFound = true;
            callbacks.splice(i, 1);
            i--;
          }
        }
      }
      if (!callbackFound) {
        throw new TypeError('Cannot off() callback that does not exist');
      }
    } else {
      throw new TypeError('Cannot off() event "' + eventName + '" because it does not exist');
    }
  },

  run: function(/* target, method, args */) {
    var length = arguments.length;
    var method, target, args;

    if (length === 1) {
      method = arguments[0];
      target = null;
    } else {
      target = arguments[0];
      method = arguments[1];
    }

    if (isString(method)) {
      method = target[method];
    }

    if (length > 2) {
      args = new Array(length - 2);
      for (var i = 0, l = length - 2; i < l; i++) {
        args[i] = arguments[i + 2];
      }
    } else {
      args = [];
    }

    var onError = getOnError(this.options);

    this.begin();

    // guard against Safari 6's double-finally bug
    var didFinally = false;

    if (onError) {
      try {
        return method.apply(target, args);
      } catch(error) {
        onError(error);
      } finally {
        if (!didFinally) {
          didFinally = true;
          this.end();
        }
      }
    } else {
      try {
        return method.apply(target, args);
      } finally {
        if (!didFinally) {
          didFinally = true;
          this.end();
        }
      }
    }
  },

  /*
    Join the passed method with an existing queue and execute immediately,
    if there isn't one use `Backburner#run`.

    The join method is like the run method except that it will schedule into
    an existing queue if one already exists. In either case, the join method will
    immediately execute the passed in function and return its result.

    @method join
    @param {Object} target
    @param {Function} method The method to be executed
    @param {any} args The method arguments
    @return method result
  */
  join: function(/* target, method, args */) {
    if (!this.currentInstance) {
      return this.run.apply(this, arguments);
    }

    var length = arguments.length;
    var method, target;

    if (length === 1) {
      method = arguments[0];
      target = null;
    } else {
      target = arguments[0];
      method = arguments[1];
    }

    if (isString(method)) {
      method = target[method];
    }

    if (length === 1) {
      return method();
    } else if (length === 2) {
      return method.call(target);
    } else {
      var args = new Array(length - 2);
      for (var i = 0, l = length - 2; i < l; i++) {
        args[i] = arguments[i + 2];
      }
      return method.apply(target, args);
    }
  },


  /*
    Defer the passed function to run inside the specified queue.

    @method defer
    @param {String} queueName
    @param {Object} target
    @param {Function|String} method The method or method name to be executed
    @param {any} args The method arguments
    @return method result
  */
  defer: function(queueName /* , target, method, args */) {
    var length = arguments.length;
    var method, target, args;

    if (length === 2) {
      method = arguments[1];
      target = null;
    } else {
      target = arguments[1];
      method = arguments[2];
    }

    if (isString(method)) {
      method = target[method];
    }

    var stack = this.DEBUG ? new Error() : undefined;

    if (length > 3) {
      args = new Array(length - 3);
      for (var i = 3; i < length; i++) {
        args[i-3] = arguments[i];
      }
    } else {
      args = undefined;
    }

    if (!this.currentInstance) { createAutorun(this); }
    return this.currentInstance.schedule(queueName, target, method, args, false, stack);
  },

  deferOnce: function(queueName /* , target, method, args */) {
    var length = arguments.length;
    var method, target, args;

    if (length === 2) {
      method = arguments[1];
      target = null;
    } else {
      target = arguments[1];
      method = arguments[2];
    }

    if (isString(method)) {
      method = target[method];
    }

    var stack = this.DEBUG ? new Error() : undefined;

    if (length > 3) {
      args = new Array(length - 3);
      for (var i = 3; i < length; i++) {
        args[i-3] = arguments[i];
      }
    } else {
      args = undefined;
    }

    if (!this.currentInstance) {
      createAutorun(this);
    }
    return this.currentInstance.schedule(queueName, target, method, args, true, stack);
  },

  setTimeout: function() {
    var l = arguments.length;
    var args = new Array(l);

    for (var x = 0; x < l; x++) {
      args[x] = arguments[x];
    }

    var length = args.length,
        method, wait, target,
        methodOrTarget, methodOrWait, methodOrArgs;

    if (length === 0) {
      return;
    } else if (length === 1) {
      method = args.shift();
      wait = 0;
    } else if (length === 2) {
      methodOrTarget = args[0];
      methodOrWait = args[1];

      if (isFunction(methodOrWait) || isFunction(methodOrTarget[methodOrWait])) {
        target = args.shift();
        method = args.shift();
        wait = 0;
      } else if (isCoercableNumber(methodOrWait)) {
        method = args.shift();
        wait = args.shift();
      } else {
        method = args.shift();
        wait =  0;
      }
    } else {
      var last = args[args.length - 1];

      if (isCoercableNumber(last)) {
        wait = args.pop();
      } else {
        wait = 0;
      }

      methodOrTarget = args[0];
      methodOrArgs = args[1];

      if (isFunction(methodOrArgs) || (isString(methodOrArgs) &&
                                      methodOrTarget !== null &&
                                      methodOrArgs in methodOrTarget)) {
        target = args.shift();
        method = args.shift();
      } else {
        method = args.shift();
      }
    }

    var executeAt = Date.now() + parseInt(wait !== wait ? 0 : wait, 10);

    if (isString(method)) {
      method = target[method];
    }

    var onError = getOnError(this.options);

    function fn() {
      if (onError) {
        try {
          method.apply(target, args);
        } catch (e) {
          onError(e);
        }
      } else {
        method.apply(target, args);
      }
    }

    return this._setTimeout(fn, executeAt);
  },

  _setTimeout: function (fn, executeAt) {
    if (this._timers.length === 0) {
      this._timers.push(executeAt, fn);
      this._installTimerTimeout();
      return fn;
    }

    // find position to insert
    var i = binarySearch(executeAt, this._timers);

    this._timers.splice(i, 0, executeAt, fn);

    // we should be the new earliest timer if i == 0
    if (i === 0) {
      this._reinstallTimerTimeout();
    }

    return fn;
  },

  throttle: function(target, method /* , args, wait, [immediate] */) {
    var backburner = this;
    var args = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }
    var immediate = args.pop();
    var wait, throttler, index, timer;

    if (isNumber(immediate) || isString(immediate)) {
      wait = immediate;
      immediate = true;
    } else {
      wait = args.pop();
    }

    wait = parseInt(wait, 10);

    index = findThrottler(target, method, this._throttlers);
    if (index > -1) { return this._throttlers[index]; } // throttled

    timer = this._platform.setTimeout(function() {
      if (!immediate) {
        backburner.run.apply(backburner, args);
      }
      var index = findThrottler(target, method, backburner._throttlers);
      if (index > -1) {
        backburner._throttlers.splice(index, 1);
      }
    }, wait);

    if (immediate) {
      this.run.apply(this, args);
    }

    throttler = [target, method, timer];

    this._throttlers.push(throttler);

    return throttler;
  },

  debounce: function(target, method /* , args, wait, [immediate] */) {
    var backburner = this;
    var args = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    var immediate = args.pop();
    var wait, index, debouncee, timer;

    if (isNumber(immediate) || isString(immediate)) {
      wait = immediate;
      immediate = false;
    } else {
      wait = args.pop();
    }

    wait = parseInt(wait, 10);
    // Remove debouncee
    index = findDebouncee(target, method, this._debouncees);

    if (index > -1) {
      debouncee = this._debouncees[index];
      this._debouncees.splice(index, 1);
      this._platform.clearTimeout(debouncee[2]);
    }

    timer = this._platform.setTimeout(function() {
      if (!immediate) {
        backburner.run.apply(backburner, args);
      }
      var index = findDebouncee(target, method, backburner._debouncees);
      if (index > -1) {
        backburner._debouncees.splice(index, 1);
      }
    }, wait);

    if (immediate && index === -1) {
      backburner.run.apply(backburner, args);
    }

    debouncee = [
      target,
      method,
      timer
    ];

    backburner._debouncees.push(debouncee);

    return debouncee;
  },

  cancelTimers: function() {
    each(this._throttlers, this._boundClearItems);
    this._throttlers = [];

    each(this._debouncees, this._boundClearItems);
    this._debouncees = [];

    this._clearTimerTimeout();
    this._timers = [];

    if (this._autorun) {
      this._platform.clearTimeout(this._autorun);
      this._autorun = null;
    }
  },

  hasTimers: function() {
    return !!this._timers.length || !!this._debouncees.length || !!this._throttlers.length || this._autorun;
  },

  cancel: function (timer) {
    var timerType = typeof timer;

    if (timer && timerType === 'object' && timer.queue && timer.method) { // we're cancelling a deferOnce
      return timer.queue.cancel(timer);
    } else if (timerType === 'function') { // we're cancelling a setTimeout
      for (var i = 0, l = this._timers.length; i < l; i += 2) {
        if (this._timers[i + 1] === timer) {
          this._timers.splice(i, 2); // remove the two elements
          if (i === 0) {
            this._reinstallTimerTimeout();
          }
          return true;
        }
      }
    } else if (Object.prototype.toString.call(timer) === '[object Array]'){ // we're cancelling a throttle or debounce
      return this._cancelItem(findThrottler, this._throttlers, timer) ||
               this._cancelItem(findDebouncee, this._debouncees, timer);
    } else {
      return; // timer was null or not a timer
    }
  },

  _cancelItem: function(findMethod, array, timer){
    var item, index;

    if (timer.length < 3) { return false; }

    index = findMethod(timer[0], timer[1], array);

    if (index > -1) {

      item = array[index];

      if (item[2] === timer[2]) {
        array.splice(index, 1);
        this._platform.clearTimeout(timer[2]);
        return true;
      }
    }

    return false;
  },

  _runExpiredTimers: function () {
    this._timerTimeoutId = undefined;
    this.run(this, this._scheduleExpiredTimers);
  },

  _scheduleExpiredTimers: function () {
    var n = Date.now();
    var timers = this._timers;
    var i = 0;
    var l = timers.length;
    for (; i < l; i += 2) {
      var executeAt = timers[i];
      var fn = timers[i+1];
      if (executeAt <= n) {
        this.schedule(this.options.defaultQueue, null, fn);
      } else {
        break;
      }
    }
    timers.splice(0, i);
    this._installTimerTimeout();
  },

  _reinstallTimerTimeout: function () {
    this._clearTimerTimeout();
    this._installTimerTimeout();
  },

  _clearTimerTimeout: function () {
    if (!this._timerTimeoutId) {
      return;
    }
    this._platform.clearTimeout(this._timerTimeoutId);
    this._timerTimeoutId = undefined;
  },

  _installTimerTimeout: function () {
    if (!this._timers.length) {
      return;
    }
    var minExpiresAt = this._timers[0];
    var n = Date.now();
    var wait = Math.max(0, minExpiresAt - n);
    this._timerTimeoutId = this._platform.setTimeout(this._boundRunExpiredTimers, wait);
  }
};

Backburner.prototype.schedule = Backburner.prototype.defer;
Backburner.prototype.scheduleOnce = Backburner.prototype.deferOnce;
Backburner.prototype.later = Backburner.prototype.setTimeout;

function getOnError(options) {
  return options.onError || (options.onErrorTarget && options.onErrorTarget[options.onErrorMethod]);
}

function createAutorun(backburner) {
  var setTimeout = backburner._platform.setTimeout;
  backburner.begin();
  backburner._autorun = setTimeout(function() {
    backburner._autorun = null;
    backburner.end();
  }, 0);
}

function findDebouncee(target, method, debouncees) {
  return findItem(target, method, debouncees);
}

function findThrottler(target, method, throttlers) {
  return findItem(target, method, throttlers);
}

function findItem(target, method, collection) {
  var item;
  var index = -1;

  for (var i = 0, l = collection.length; i < l; i++) {
    item = collection[i];
    if (item[0] === target && item[1] === method) {
      index = i;
      break;
    }
  }

  return index;
}

function clearItems(item) {
  this._platform.clearTimeout(item[2]);
}

exports['default'] = Backburner;

Object.defineProperty(exports, '__esModule', { value: true });

});
enifed('container/container', ['exports', 'ember-utils', 'ember-environment', 'ember-metal'], function (exports, _emberUtils, _emberEnvironment, _emberMetal) {
  'use strict';

  exports.default = Container;
  exports.buildFakeContainerWithDeprecations = buildFakeContainerWithDeprecations;

  var CONTAINER_OVERRIDE = _emberUtils.symbol('CONTAINER_OVERRIDE');

  /**
   A container used to instantiate and cache objects.
  
   Every `Container` must be associated with a `Registry`, which is referenced
   to determine the factory and options that should be used to instantiate
   objects.
  
   The public API for `Container` is still in flux and should not be considered
   stable.
  
   @private
   @class Container
   */

  function Container(registry, options) {
    this.registry = registry;
    this.owner = options && options.owner ? options.owner : null;
    this.cache = _emberUtils.dictionary(options && options.cache ? options.cache : null);
    this.factoryCache = _emberUtils.dictionary(options && options.factoryCache ? options.factoryCache : null);
    this.validationCache = _emberUtils.dictionary(options && options.validationCache ? options.validationCache : null);
    this._fakeContainerToInject = buildFakeContainerWithDeprecations(this);
    this[CONTAINER_OVERRIDE] = undefined;
    this.isDestroyed = false;
  }

  Container.prototype = {
    /**
     @private
     @property owner
     @type Object
     */
    owner: null,

    /**
     @private
     @property registry
     @type Registry
     @since 1.11.0
     */
    registry: null,

    /**
     @private
     @property cache
     @type InheritingDict
     */
    cache: null,

    /**
     @private
     @property factoryCache
     @type InheritingDict
     */
    factoryCache: null,

    /**
     @private
     @property validationCache
     @type InheritingDict
     */
    validationCache: null,

    /**
     Given a fullName return a corresponding instance.
      The default behaviour is for lookup to return a singleton instance.
     The singleton is scoped to the container, allowing multiple containers
     to all have their own locally scoped singletons.
      ```javascript
     let registry = new Registry();
     let container = registry.container();
      registry.register('api:twitter', Twitter);
      let twitter = container.lookup('api:twitter');
      twitter instanceof Twitter; // => true
      // by default the container will return singletons
     let twitter2 = container.lookup('api:twitter');
     twitter2 instanceof Twitter; // => true
      twitter === twitter2; //=> true
     ```
      If singletons are not wanted, an optional flag can be provided at lookup.
      ```javascript
     let registry = new Registry();
     let container = registry.container();
      registry.register('api:twitter', Twitter);
      let twitter = container.lookup('api:twitter', { singleton: false });
     let twitter2 = container.lookup('api:twitter', { singleton: false });
      twitter === twitter2; //=> false
     ```
      @private
     @method lookup
     @param {String} fullName
     @param {Object} [options]
     @param {String} [options.source] The fullname of the request source (used for local lookup)
     @return {any}
     */
    lookup: function (fullName, options) {
      _emberMetal.assert('fullName must be a proper full name', this.registry.validateFullName(fullName));
      return lookup(this, this.registry.normalize(fullName), options);
    },

    /**
     Given a fullName, return the corresponding factory.
      @private
     @method lookupFactory
     @param {String} fullName
     @param {Object} [options]
     @param {String} [options.source] The fullname of the request source (used for local lookup)
     @return {any}
     */
    lookupFactory: function (fullName, options) {
      _emberMetal.assert('fullName must be a proper full name', this.registry.validateFullName(fullName));
      return factoryFor(this, this.registry.normalize(fullName), options);
    },

    /**
     A depth first traversal, destroying the container, its descendant containers and all
     their managed objects.
      @private
     @method destroy
     */
    destroy: function () {
      eachDestroyable(this, function (item) {
        if (item.destroy) {
          item.destroy();
        }
      });

      this.isDestroyed = true;
    },

    /**
     Clear either the entire cache or just the cache for a particular key.
      @private
     @method reset
     @param {String} fullName optional key to reset; if missing, resets everything
     */
    reset: function (fullName) {
      if (arguments.length > 0) {
        resetMember(this, this.registry.normalize(fullName));
      } else {
        resetCache(this);
      }
    },

    /**
     Returns an object that can be used to provide an owner to a
     manually created instance.
      @private
     @method ownerInjection
     @returns { Object }
    */
    ownerInjection: function () {
      var _ref;

      return _ref = {}, _ref[_emberUtils.OWNER] = this.owner, _ref;
    }
  };

  function isSingleton(container, fullName) {
    return container.registry.getOption(fullName, 'singleton') !== false;
  }

  function lookup(container, fullName) {
    var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

    if (options.source) {
      fullName = container.registry.expandLocalLookup(fullName, options);

      // if expandLocalLookup returns falsey, we do not support local lookup
      if (!fullName) {
        return;
      }
    }

    if (container.cache[fullName] !== undefined && options.singleton !== false) {
      return container.cache[fullName];
    }

    var value = instantiate(container, fullName);

    if (value === undefined) {
      return;
    }

    if (isSingleton(container, fullName) && options.singleton !== false) {
      container.cache[fullName] = value;
    }

    return value;
  }

  function markInjectionsAsDynamic(injections) {
    injections._dynamic = true;
  }

  function areInjectionsDynamic(injections) {
    return !!injections._dynamic;
  }

  function buildInjections() /* container, ...injections */{
    var hash = {};

    if (arguments.length > 1) {
      var container = arguments[0];
      var injections = [];
      var injection = undefined;

      for (var i = 1; i < arguments.length; i++) {
        if (arguments[i]) {
          injections = injections.concat(arguments[i]);
        }
      }

      container.registry.validateInjections(injections);

      for (var i = 0; i < injections.length; i++) {
        injection = injections[i];
        hash[injection.property] = lookup(container, injection.fullName);
        if (!isSingleton(container, injection.fullName)) {
          markInjectionsAsDynamic(hash);
        }
      }
    }

    return hash;
  }

  function factoryFor(container, fullName) {
    var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

    var registry = container.registry;

    if (options.source) {
      fullName = registry.expandLocalLookup(fullName, options);

      // if expandLocalLookup returns falsey, we do not support local lookup
      if (!fullName) {
        return;
      }
    }

    var cache = container.factoryCache;
    if (cache[fullName]) {
      return cache[fullName];
    }
    var factory = registry.resolve(fullName);
    if (factory === undefined) {
      return;
    }

    var type = fullName.split(':')[0];
    if (!factory || typeof factory.extend !== 'function' || !_emberEnvironment.ENV.MODEL_FACTORY_INJECTIONS && type === 'model') {
      if (factory && typeof factory._onLookup === 'function') {
        factory._onLookup(fullName);
      }

      // TODO: think about a 'safe' merge style extension
      // for now just fallback to create time injection
      cache[fullName] = factory;
      return factory;
    } else {
      var injections = injectionsFor(container, fullName);
      var factoryInjections = factoryInjectionsFor(container, fullName);
      var cacheable = !areInjectionsDynamic(injections) && !areInjectionsDynamic(factoryInjections);

      factoryInjections._toString = registry.makeToString(factory, fullName);

      var injectedFactory = factory.extend(injections);

      // TODO - remove all `container` injections when Ember reaches v3.0.0
      injectDeprecatedContainer(injectedFactory.prototype, container);
      injectedFactory.reopenClass(factoryInjections);

      if (factory && typeof factory._onLookup === 'function') {
        factory._onLookup(fullName);
      }

      if (cacheable) {
        cache[fullName] = injectedFactory;
      }

      return injectedFactory;
    }
  }

  function injectionsFor(container, fullName) {
    var registry = container.registry;
    var splitName = fullName.split(':');
    var type = splitName[0];

    var injections = buildInjections(container, registry.getTypeInjections(type), registry.getInjections(fullName));
    injections._debugContainerKey = fullName;

    _emberUtils.setOwner(injections, container.owner);

    return injections;
  }

  function factoryInjectionsFor(container, fullName) {
    var registry = container.registry;
    var splitName = fullName.split(':');
    var type = splitName[0];

    var factoryInjections = buildInjections(container, registry.getFactoryTypeInjections(type), registry.getFactoryInjections(fullName));
    factoryInjections._debugContainerKey = fullName;

    return factoryInjections;
  }

  function instantiate(container, fullName) {
    var factory = factoryFor(container, fullName);
    var lazyInjections = undefined,
        validationCache = undefined;

    if (container.registry.getOption(fullName, 'instantiate') === false) {
      return factory;
    }

    if (factory) {
      if (typeof factory.create !== 'function') {
        throw new Error('Failed to create an instance of \'' + fullName + '\'. Most likely an improperly defined class or' + ' an invalid module export.');
      }

      validationCache = container.validationCache;

      _emberMetal.runInDebug(function () {
        // Ensure that all lazy injections are valid at instantiation time
        if (!validationCache[fullName] && typeof factory._lazyInjections === 'function') {
          lazyInjections = factory._lazyInjections();
          lazyInjections = container.registry.normalizeInjectionsHash(lazyInjections);

          container.registry.validateInjections(lazyInjections);
        }
      });

      validationCache[fullName] = true;

      var obj = undefined;

      if (typeof factory.extend === 'function') {
        // assume the factory was extendable and is already injected
        obj = factory.create();
      } else {
        // assume the factory was extendable
        // to create time injections
        // TODO: support new'ing for instantiation and merge injections for pure JS Functions
        var injections = injectionsFor(container, fullName);

        // Ensure that a container is available to an object during instantiation.
        // TODO - remove when Ember reaches v3.0.0
        // This "fake" container will be replaced after instantiation with a
        // property that raises deprecations every time it is accessed.
        injections.container = container._fakeContainerToInject;
        obj = factory.create(injections);

        // TODO - remove when Ember reaches v3.0.0
        if (!Object.isFrozen(obj) && 'container' in obj) {
          injectDeprecatedContainer(obj, container);
        }
      }

      return obj;
    }
  }

  // TODO - remove when Ember reaches v3.0.0
  function injectDeprecatedContainer(object, container) {
    Object.defineProperty(object, 'container', {
      configurable: true,
      enumerable: false,
      get: function () {
        _emberMetal.deprecate('Using the injected `container` is deprecated. Please use the `getOwner` helper instead to access the owner of this object.', false, { id: 'ember-application.injected-container', until: '3.0.0', url: 'http://emberjs.com/deprecations/v2.x#toc_injected-container-access' });
        return this[CONTAINER_OVERRIDE] || container;
      },

      set: function (value) {
        _emberMetal.deprecate('Providing the `container` property to ' + this + ' is deprecated. Please use `Ember.setOwner` or `owner.ownerInjection()` instead to provide an owner to the instance being created.', false, { id: 'ember-application.injected-container', until: '3.0.0', url: 'http://emberjs.com/deprecations/v2.x#toc_injected-container-access' });

        this[CONTAINER_OVERRIDE] = value;

        return value;
      }
    });
  }

  function eachDestroyable(container, callback) {
    var cache = container.cache;
    var keys = Object.keys(cache);

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = cache[key];

      if (container.registry.getOption(key, 'instantiate') !== false) {
        callback(value);
      }
    }
  }

  function resetCache(container) {
    eachDestroyable(container, function (value) {
      if (value.destroy) {
        value.destroy();
      }
    });

    container.cache.dict = _emberUtils.dictionary(null);
  }

  function resetMember(container, fullName) {
    var member = container.cache[fullName];

    delete container.factoryCache[fullName];

    if (member) {
      delete container.cache[fullName];

      if (member.destroy) {
        member.destroy();
      }
    }
  }

  function buildFakeContainerWithDeprecations(container) {
    var fakeContainer = {};
    var propertyMappings = {
      lookup: 'lookup',
      lookupFactory: '_lookupFactory'
    };

    for (var containerProperty in propertyMappings) {
      fakeContainer[containerProperty] = buildFakeContainerFunction(container, containerProperty, propertyMappings[containerProperty]);
    }

    return fakeContainer;
  }

  function buildFakeContainerFunction(container, containerProperty, ownerProperty) {
    return function () {
      _emberMetal.deprecate('Using the injected `container` is deprecated. Please use the `getOwner` helper to access the owner of this object and then call `' + ownerProperty + '` instead.', false, {
        id: 'ember-application.injected-container',
        until: '3.0.0',
        url: 'http://emberjs.com/deprecations/v2.x#toc_injected-container-access'
      });
      return container[containerProperty].apply(container, arguments);
    };
  }
});
enifed('container/index', ['exports', 'container/registry', 'container/container'], function (exports, _containerRegistry, _containerContainer) {
  /*
  Public API for the container is still in flux.
  The public API, specified on the application namespace should be considered the stable API.
  // @module container
    @private
  */

  'use strict';

  exports.Registry = _containerRegistry.default;
  exports.privatize = _containerRegistry.privatize;
  exports.Container = _containerContainer.default;
  exports.buildFakeContainerWithDeprecations = _containerContainer.buildFakeContainerWithDeprecations;
});
enifed('container/registry', ['exports', 'ember-utils', 'ember-metal', 'container/container'], function (exports, _emberUtils, _emberMetal, _containerContainer) {
  'use strict';

  exports.default = Registry;
  exports.privatize = privatize;

  var VALID_FULL_NAME_REGEXP = /^[^:]+:[^:]+$/;

  /**
   A registry used to store factory and option information keyed
   by type.
  
   A `Registry` stores the factory and option information needed by a
   `Container` to instantiate and cache objects.
  
   The API for `Registry` is still in flux and should not be considered stable.
  
   @private
   @class Registry
   @since 1.11.0
  */

  function Registry(options) {
    this.fallback = options && options.fallback ? options.fallback : null;

    if (options && options.resolver) {
      this.resolver = options.resolver;

      if (typeof this.resolver === 'function') {
        deprecateResolverFunction(this);
      }
    }

    this.registrations = _emberUtils.dictionary(options && options.registrations ? options.registrations : null);

    this._typeInjections = _emberUtils.dictionary(null);
    this._injections = _emberUtils.dictionary(null);
    this._factoryTypeInjections = _emberUtils.dictionary(null);
    this._factoryInjections = _emberUtils.dictionary(null);

    this._localLookupCache = new _emberUtils.EmptyObject();
    this._normalizeCache = _emberUtils.dictionary(null);
    this._resolveCache = _emberUtils.dictionary(null);
    this._failCache = _emberUtils.dictionary(null);

    this._options = _emberUtils.dictionary(null);
    this._typeOptions = _emberUtils.dictionary(null);
  }

  Registry.prototype = {
    /**
     A backup registry for resolving registrations when no matches can be found.
      @private
     @property fallback
     @type Registry
     */
    fallback: null,

    /**
     An object that has a `resolve` method that resolves a name.
      @private
     @property resolver
     @type Resolver
     */
    resolver: null,

    /**
     @private
     @property registrations
     @type InheritingDict
     */
    registrations: null,

    /**
     @private
      @property _typeInjections
     @type InheritingDict
     */
    _typeInjections: null,

    /**
     @private
      @property _injections
     @type InheritingDict
     */
    _injections: null,

    /**
     @private
      @property _factoryTypeInjections
     @type InheritingDict
     */
    _factoryTypeInjections: null,

    /**
     @private
      @property _factoryInjections
     @type InheritingDict
     */
    _factoryInjections: null,

    /**
     @private
      @property _normalizeCache
     @type InheritingDict
     */
    _normalizeCache: null,

    /**
     @private
      @property _resolveCache
     @type InheritingDict
     */
    _resolveCache: null,

    /**
     @private
      @property _options
     @type InheritingDict
     */
    _options: null,

    /**
     @private
      @property _typeOptions
     @type InheritingDict
     */
    _typeOptions: null,

    /**
     Creates a container based on this registry.
      @private
     @method container
     @param {Object} options
     @return {Container} created container
     */
    container: function (options) {
      return new _containerContainer.default(this, options);
    },

    /**
     Registers a factory for later injection.
      Example:
      ```javascript
     let registry = new Registry();
      registry.register('model:user', Person, {singleton: false });
     registry.register('fruit:favorite', Orange);
     registry.register('communication:main', Email, {singleton: false});
     ```
      @private
     @method register
     @param {String} fullName
     @param {Function} factory
     @param {Object} options
     */
    register: function (fullName, factory) {
      var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      _emberMetal.assert('fullName must be a proper full name', this.validateFullName(fullName));

      if (factory === undefined) {
        throw new TypeError('Attempting to register an unknown factory: \'' + fullName + '\'');
      }

      var normalizedName = this.normalize(fullName);

      if (this._resolveCache[normalizedName]) {
        throw new Error('Cannot re-register: \'' + fullName + '\', as it has already been resolved.');
      }

      delete this._failCache[normalizedName];
      this.registrations[normalizedName] = factory;
      this._options[normalizedName] = options;
    },

    /**
     Unregister a fullName
      ```javascript
     let registry = new Registry();
     registry.register('model:user', User);
      registry.resolve('model:user').create() instanceof User //=> true
      registry.unregister('model:user')
     registry.resolve('model:user') === undefined //=> true
     ```
      @private
     @method unregister
     @param {String} fullName
     */
    unregister: function (fullName) {
      _emberMetal.assert('fullName must be a proper full name', this.validateFullName(fullName));

      var normalizedName = this.normalize(fullName);

      this._localLookupCache = new _emberUtils.EmptyObject();

      delete this.registrations[normalizedName];
      delete this._resolveCache[normalizedName];
      delete this._failCache[normalizedName];
      delete this._options[normalizedName];
    },

    /**
     Given a fullName return the corresponding factory.
      By default `resolve` will retrieve the factory from
     the registry.
      ```javascript
     let registry = new Registry();
     registry.register('api:twitter', Twitter);
      registry.resolve('api:twitter') // => Twitter
     ```
      Optionally the registry can be provided with a custom resolver.
     If provided, `resolve` will first provide the custom resolver
     the opportunity to resolve the fullName, otherwise it will fallback
     to the registry.
      ```javascript
     let registry = new Registry();
     registry.resolver = function(fullName) {
        // lookup via the module system of choice
      };
      // the twitter factory is added to the module system
     registry.resolve('api:twitter') // => Twitter
     ```
      @private
     @method resolve
     @param {String} fullName
     @param {Object} [options]
     @param {String} [options.source] the fullname of the request source (used for local lookups)
     @return {Function} fullName's factory
     */
    resolve: function (fullName, options) {
      _emberMetal.assert('fullName must be a proper full name', this.validateFullName(fullName));
      var factory = resolve(this, this.normalize(fullName), options);
      if (factory === undefined && this.fallback) {
        var _fallback;

        factory = (_fallback = this.fallback).resolve.apply(_fallback, arguments);
      }
      return factory;
    },

    /**
     A hook that can be used to describe how the resolver will
     attempt to find the factory.
      For example, the default Ember `.describe` returns the full
     class name (including namespace) where Ember's resolver expects
     to find the `fullName`.
      @private
     @method describe
     @param {String} fullName
     @return {string} described fullName
     */
    describe: function (fullName) {
      if (this.resolver && this.resolver.lookupDescription) {
        return this.resolver.lookupDescription(fullName);
      } else if (this.fallback) {
        return this.fallback.describe(fullName);
      } else {
        return fullName;
      }
    },

    /**
     A hook to enable custom fullName normalization behaviour
      @private
     @method normalizeFullName
     @param {String} fullName
     @return {string} normalized fullName
     */
    normalizeFullName: function (fullName) {
      if (this.resolver && this.resolver.normalize) {
        return this.resolver.normalize(fullName);
      } else if (this.fallback) {
        return this.fallback.normalizeFullName(fullName);
      } else {
        return fullName;
      }
    },

    /**
     Normalize a fullName based on the application's conventions
      @private
     @method normalize
     @param {String} fullName
     @return {string} normalized fullName
     */
    normalize: function (fullName) {
      return this._normalizeCache[fullName] || (this._normalizeCache[fullName] = this.normalizeFullName(fullName));
    },

    /**
     @method makeToString
      @private
     @param {any} factory
     @param {string} fullName
     @return {function} toString function
     */
    makeToString: function (factory, fullName) {
      if (this.resolver && this.resolver.makeToString) {
        return this.resolver.makeToString(factory, fullName);
      } else if (this.fallback) {
        return this.fallback.makeToString(factory, fullName);
      } else {
        return factory.toString();
      }
    },

    /**
     Given a fullName check if the container is aware of its factory
     or singleton instance.
      @private
     @method has
     @param {String} fullName
     @param {Object} [options]
     @param {String} [options.source] the fullname of the request source (used for local lookups)
     @return {Boolean}
     */
    has: function (fullName, options) {
      if (!this.isValidFullName(fullName)) {
        return false;
      }

      var source = options && options.source && this.normalize(options.source);

      return has(this, this.normalize(fullName), source);
    },

    /**
     Allow registering options for all factories of a type.
      ```javascript
     let registry = new Registry();
     let container = registry.container();
      // if all of type `connection` must not be singletons
     registry.optionsForType('connection', { singleton: false });
      registry.register('connection:twitter', TwitterConnection);
     registry.register('connection:facebook', FacebookConnection);
      let twitter = container.lookup('connection:twitter');
     let twitter2 = container.lookup('connection:twitter');
      twitter === twitter2; // => false
      let facebook = container.lookup('connection:facebook');
     let facebook2 = container.lookup('connection:facebook');
      facebook === facebook2; // => false
     ```
      @private
     @method optionsForType
     @param {String} type
     @param {Object} options
     */
    optionsForType: function (type, options) {
      this._typeOptions[type] = options;
    },

    getOptionsForType: function (type) {
      var optionsForType = this._typeOptions[type];
      if (optionsForType === undefined && this.fallback) {
        optionsForType = this.fallback.getOptionsForType(type);
      }
      return optionsForType;
    },

    /**
     @private
     @method options
     @param {String} fullName
     @param {Object} options
     */
    options: function (fullName) {
      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      var normalizedName = this.normalize(fullName);
      this._options[normalizedName] = options;
    },

    getOptions: function (fullName) {
      var normalizedName = this.normalize(fullName);
      var options = this._options[normalizedName];

      if (options === undefined && this.fallback) {
        options = this.fallback.getOptions(fullName);
      }
      return options;
    },

    getOption: function (fullName, optionName) {
      var options = this._options[fullName];

      if (options && options[optionName] !== undefined) {
        return options[optionName];
      }

      var type = fullName.split(':')[0];
      options = this._typeOptions[type];

      if (options && options[optionName] !== undefined) {
        return options[optionName];
      } else if (this.fallback) {
        return this.fallback.getOption(fullName, optionName);
      }
    },

    /**
     Used only via `injection`.
      Provides a specialized form of injection, specifically enabling
     all objects of one type to be injected with a reference to another
     object.
      For example, provided each object of type `controller` needed a `router`.
     one would do the following:
      ```javascript
     let registry = new Registry();
     let container = registry.container();
      registry.register('router:main', Router);
     registry.register('controller:user', UserController);
     registry.register('controller:post', PostController);
      registry.typeInjection('controller', 'router', 'router:main');
      let user = container.lookup('controller:user');
     let post = container.lookup('controller:post');
      user.router instanceof Router; //=> true
     post.router instanceof Router; //=> true
      // both controllers share the same router
     user.router === post.router; //=> true
     ```
      @private
     @method typeInjection
     @param {String} type
     @param {String} property
     @param {String} fullName
     */
    typeInjection: function (type, property, fullName) {
      _emberMetal.assert('fullName must be a proper full name', this.validateFullName(fullName));

      var fullNameType = fullName.split(':')[0];
      if (fullNameType === type) {
        throw new Error('Cannot inject a \'' + fullName + '\' on other ' + type + '(s).');
      }

      var injections = this._typeInjections[type] || (this._typeInjections[type] = []);

      injections.push({
        property: property,
        fullName: fullName
      });
    },

    /**
     Defines injection rules.
      These rules are used to inject dependencies onto objects when they
     are instantiated.
      Two forms of injections are possible:
      * Injecting one fullName on another fullName
     * Injecting one fullName on a type
      Example:
      ```javascript
     let registry = new Registry();
     let container = registry.container();
      registry.register('source:main', Source);
     registry.register('model:user', User);
     registry.register('model:post', Post);
      // injecting one fullName on another fullName
     // eg. each user model gets a post model
     registry.injection('model:user', 'post', 'model:post');
      // injecting one fullName on another type
     registry.injection('model', 'source', 'source:main');
      let user = container.lookup('model:user');
     let post = container.lookup('model:post');
      user.source instanceof Source; //=> true
     post.source instanceof Source; //=> true
      user.post instanceof Post; //=> true
      // and both models share the same source
     user.source === post.source; //=> true
     ```
      @private
     @method injection
     @param {String} factoryName
     @param {String} property
     @param {String} injectionName
     */
    injection: function (fullName, property, injectionName) {
      this.validateFullName(injectionName);
      var normalizedInjectionName = this.normalize(injectionName);

      if (fullName.indexOf(':') === -1) {
        return this.typeInjection(fullName, property, normalizedInjectionName);
      }

      _emberMetal.assert('fullName must be a proper full name', this.validateFullName(fullName));
      var normalizedName = this.normalize(fullName);

      var injections = this._injections[normalizedName] || (this._injections[normalizedName] = []);

      injections.push({
        property: property,
        fullName: normalizedInjectionName
      });
    },

    /**
     Used only via `factoryInjection`.
      Provides a specialized form of injection, specifically enabling
     all factory of one type to be injected with a reference to another
     object.
      For example, provided each factory of type `model` needed a `store`.
     one would do the following:
      ```javascript
     let registry = new Registry();
      registry.register('store:main', SomeStore);
      registry.factoryTypeInjection('model', 'store', 'store:main');
      let store = registry.lookup('store:main');
     let UserFactory = registry.lookupFactory('model:user');
      UserFactory.store instanceof SomeStore; //=> true
     ```
      @private
     @method factoryTypeInjection
     @param {String} type
     @param {String} property
     @param {String} fullName
     */
    factoryTypeInjection: function (type, property, fullName) {
      var injections = this._factoryTypeInjections[type] || (this._factoryTypeInjections[type] = []);

      injections.push({
        property: property,
        fullName: this.normalize(fullName)
      });
    },

    /**
     Defines factory injection rules.
      Similar to regular injection rules, but are run against factories, via
     `Registry#lookupFactory`.
      These rules are used to inject objects onto factories when they
     are looked up.
      Two forms of injections are possible:
      * Injecting one fullName on another fullName
     * Injecting one fullName on a type
      Example:
      ```javascript
     let registry = new Registry();
     let container = registry.container();
      registry.register('store:main', Store);
     registry.register('store:secondary', OtherStore);
     registry.register('model:user', User);
     registry.register('model:post', Post);
      // injecting one fullName on another type
     registry.factoryInjection('model', 'store', 'store:main');
      // injecting one fullName on another fullName
     registry.factoryInjection('model:post', 'secondaryStore', 'store:secondary');
      let UserFactory = container.lookupFactory('model:user');
     let PostFactory = container.lookupFactory('model:post');
     let store = container.lookup('store:main');
      UserFactory.store instanceof Store; //=> true
     UserFactory.secondaryStore instanceof OtherStore; //=> false
      PostFactory.store instanceof Store; //=> true
     PostFactory.secondaryStore instanceof OtherStore; //=> true
      // and both models share the same source instance
     UserFactory.store === PostFactory.store; //=> true
     ```
      @private
     @method factoryInjection
     @param {String} factoryName
     @param {String} property
     @param {String} injectionName
     */
    factoryInjection: function (fullName, property, injectionName) {
      var normalizedName = this.normalize(fullName);
      var normalizedInjectionName = this.normalize(injectionName);

      this.validateFullName(injectionName);

      if (fullName.indexOf(':') === -1) {
        return this.factoryTypeInjection(normalizedName, property, normalizedInjectionName);
      }

      var injections = this._factoryInjections[normalizedName] || (this._factoryInjections[normalizedName] = []);

      injections.push({
        property: property,
        fullName: normalizedInjectionName
      });
    },

    /**
     @private
     @method knownForType
     @param {String} type the type to iterate over
    */
    knownForType: function (type) {
      var fallbackKnown = undefined,
          resolverKnown = undefined;

      var localKnown = _emberUtils.dictionary(null);
      var registeredNames = Object.keys(this.registrations);
      for (var index = 0; index < registeredNames.length; index++) {
        var fullName = registeredNames[index];
        var itemType = fullName.split(':')[0];

        if (itemType === type) {
          localKnown[fullName] = true;
        }
      }

      if (this.fallback) {
        fallbackKnown = this.fallback.knownForType(type);
      }

      if (this.resolver && this.resolver.knownForType) {
        resolverKnown = this.resolver.knownForType(type);
      }

      return _emberUtils.assign({}, fallbackKnown, localKnown, resolverKnown);
    },

    validateFullName: function (fullName) {
      if (!this.isValidFullName(fullName)) {
        throw new TypeError('Invalid Fullname, expected: \'type:name\' got: ' + fullName);
      }

      return true;
    },

    isValidFullName: function (fullName) {
      return !!VALID_FULL_NAME_REGEXP.test(fullName);
    },

    validateInjections: function (injections) {
      if (!injections) {
        return;
      }

      var fullName = undefined;

      for (var i = 0; i < injections.length; i++) {
        fullName = injections[i].fullName;

        if (!this.has(fullName)) {
          throw new Error('Attempting to inject an unknown injection: \'' + fullName + '\'');
        }
      }
    },

    normalizeInjectionsHash: function (hash) {
      var injections = [];

      for (var key in hash) {
        if (hash.hasOwnProperty(key)) {
          _emberMetal.assert('Expected a proper full name, given \'' + hash[key] + '\'', this.validateFullName(hash[key]));

          injections.push({
            property: key,
            fullName: hash[key]
          });
        }
      }

      return injections;
    },

    getInjections: function (fullName) {
      var injections = this._injections[fullName] || [];
      if (this.fallback) {
        injections = injections.concat(this.fallback.getInjections(fullName));
      }
      return injections;
    },

    getTypeInjections: function (type) {
      var injections = this._typeInjections[type] || [];
      if (this.fallback) {
        injections = injections.concat(this.fallback.getTypeInjections(type));
      }
      return injections;
    },

    getFactoryInjections: function (fullName) {
      var injections = this._factoryInjections[fullName] || [];
      if (this.fallback) {
        injections = injections.concat(this.fallback.getFactoryInjections(fullName));
      }
      return injections;
    },

    getFactoryTypeInjections: function (type) {
      var injections = this._factoryTypeInjections[type] || [];
      if (this.fallback) {
        injections = injections.concat(this.fallback.getFactoryTypeInjections(type));
      }
      return injections;
    }
  };

  function deprecateResolverFunction(registry) {
    _emberMetal.deprecate('Passing a `resolver` function into a Registry is deprecated. Please pass in a Resolver object with a `resolve` method.', false, { id: 'ember-application.registry-resolver-as-function', until: '3.0.0', url: 'http://emberjs.com/deprecations/v2.x#toc_registry-resolver-as-function' });
    registry.resolver = {
      resolve: registry.resolver
    };
  }

  /**
   Given a fullName and a source fullName returns the fully resolved
   fullName. Used to allow for local lookup.
  
   ```javascript
   let registry = new Registry();
  
   // the twitter factory is added to the module system
   registry.expandLocalLookup('component:post-title', { source: 'template:post' }) // => component:post/post-title
   ```
  
   @private
   @method expandLocalLookup
   @param {String} fullName
   @param {Object} [options]
   @param {String} [options.source] the fullname of the request source (used for local lookups)
   @return {String} fullName
   */
  Registry.prototype.expandLocalLookup = function Registry_expandLocalLookup(fullName, options) {
    if (this.resolver && this.resolver.expandLocalLookup) {
      _emberMetal.assert('fullName must be a proper full name', this.validateFullName(fullName));
      _emberMetal.assert('options.source must be provided to expandLocalLookup', options && options.source);
      _emberMetal.assert('options.source must be a proper full name', this.validateFullName(options.source));

      var normalizedFullName = this.normalize(fullName);
      var normalizedSource = this.normalize(options.source);

      return expandLocalLookup(this, normalizedFullName, normalizedSource);
    } else if (this.fallback) {
      return this.fallback.expandLocalLookup(fullName, options);
    } else {
      return null;
    }
  };

  function expandLocalLookup(registry, normalizedName, normalizedSource) {
    var cache = registry._localLookupCache;
    var normalizedNameCache = cache[normalizedName];

    if (!normalizedNameCache) {
      normalizedNameCache = cache[normalizedName] = new _emberUtils.EmptyObject();
    }

    var cached = normalizedNameCache[normalizedSource];

    if (cached !== undefined) {
      return cached;
    }

    var expanded = registry.resolver.expandLocalLookup(normalizedName, normalizedSource);

    return normalizedNameCache[normalizedSource] = expanded;
  }

  function resolve(registry, normalizedName, options) {
    if (options && options.source) {
      // when `source` is provided expand normalizedName
      // and source into the full normalizedName
      normalizedName = registry.expandLocalLookup(normalizedName, options);

      // if expandLocalLookup returns falsey, we do not support local lookup
      if (!normalizedName) {
        return;
      }
    }

    var cached = registry._resolveCache[normalizedName];
    if (cached !== undefined) {
      return cached;
    }
    if (registry._failCache[normalizedName]) {
      return;
    }

    var resolved = undefined;

    if (registry.resolver) {
      resolved = registry.resolver.resolve(normalizedName);
    }

    if (resolved === undefined) {
      resolved = registry.registrations[normalizedName];
    }

    if (resolved === undefined) {
      registry._failCache[normalizedName] = true;
    } else {
      registry._resolveCache[normalizedName] = resolved;
    }

    return resolved;
  }

  function has(registry, fullName, source) {
    return registry.resolve(fullName, { source: source }) !== undefined;
  }

  var privateNames = _emberUtils.dictionary(null);
  var privateSuffix = '' + Math.random() + Date.now();

  function privatize(_ref) {
    var fullName = _ref[0];

    var name = privateNames[fullName];
    if (name) {
      return name;
    }

    var _fullName$split = fullName.split(':');

    var type = _fullName$split[0];
    var rawName = _fullName$split[1];

    return privateNames[fullName] = _emberUtils.intern(type + ':' + rawName + '-' + privateSuffix);
  }
});
enifed('dag-map', ['exports'], function (exports) { 'use strict';

/**
 * A map of key/value pairs with dependencies contraints that can be traversed
 * in topological order and is checked for cycles.
 *
 * @class DAG
 * @constructor
 */
var DAG = (function () {
    function DAG() {
        this._vertices = new Vertices();
    }
    /**
     * Adds a key/value pair with dependencies on other key/value pairs.
     *
     * @public
     * @method addEdges
     * @param {string[]}   key The key of the vertex to be added.
     * @param {any}      value The value of that vertex.
     * @param {string[]|string|undefined}  before A key or array of keys of the vertices that must
     *                                            be visited before this vertex.
     * @param {string[]|string|undefined}   after An string or array of strings with the keys of the
     *                                            vertices that must be after this vertex is visited.
     */
    DAG.prototype.add = function (key, value, before, after) {
        var vertices = this._vertices;
        var v = vertices.add(key);
        v.val = value;
        if (before) {
            if (typeof before === "string") {
                vertices.addEdge(v, vertices.add(before));
            }
            else {
                for (var i = 0; i < before.length; i++) {
                    vertices.addEdge(v, vertices.add(before[i]));
                }
            }
        }
        if (after) {
            if (typeof after === "string") {
                vertices.addEdge(vertices.add(after), v);
            }
            else {
                for (var i = 0; i < after.length; i++) {
                    vertices.addEdge(vertices.add(after[i]), v);
                }
            }
        }
    };
    /**
     * Visits key/value pairs in topological order.
     *
     * @public
     * @method  topsort
     * @param {Function} fn The function to be invoked with each key/value.
     */
    DAG.prototype.topsort = function (callback) {
        this._vertices.topsort(callback);
    };
    return DAG;
}());
var Vertices = (function () {
    function Vertices() {
        this.stack = new IntStack();
        this.result = new IntStack();
        this.vertices = [];
    }
    Vertices.prototype.add = function (key) {
        if (!key)
            throw new Error("missing key");
        var vertices = this.vertices;
        var i = 0;
        var vertex;
        for (; i < vertices.length; i++) {
            vertex = vertices[i];
            if (vertex.key === key)
                return vertex;
        }
        return vertices[i] = {
            id: i,
            key: key,
            val: null,
            inc: null,
            out: false,
            mark: false
        };
    };
    Vertices.prototype.addEdge = function (v, w) {
        this.check(v, w.key);
        var inc = w.inc;
        if (!inc) {
            w.inc = [v.id];
        }
        else {
            var i = 0;
            for (; i < inc.length; i++) {
                if (inc[i] === v.id)
                    return;
            }
            inc[i] = v.id;
        }
        v.out = true;
    };
    Vertices.prototype.topsort = function (cb) {
        this.reset();
        var vertices = this.vertices;
        for (var i = 0; i < vertices.length; i++) {
            var vertex = vertices[i];
            if (vertex.out)
                continue;
            this.visit(vertex, undefined);
        }
        this.each(cb);
    };
    Vertices.prototype.check = function (v, w) {
        if (v.key === w) {
            throw new Error("cycle detected: " + w + " <- " + w);
        }
        var inc = v.inc;
        // quick check
        if (!inc || inc.length === 0)
            return;
        var vertices = this.vertices;
        // shallow check
        for (var i = 0; i < inc.length; i++) {
            var key = vertices[inc[i]].key;
            if (key === w) {
                throw new Error("cycle detected: " + w + " <- " + v.key + " <- " + w);
            }
        }
        // deep check
        this.reset();
        this.visit(v, w);
        if (this.result.len > 0) {
            var msg_1 = "cycle detected: " + w;
            this.each(function (key) {
                msg_1 += " <- " + key;
            });
            throw new Error(msg_1);
        }
    };
    Vertices.prototype.each = function (cb) {
        var _a = this, result = _a.result, vertices = _a.vertices;
        for (var i = 0; i < result.len; i++) {
            var vertex = vertices[result.stack[i]];
            cb(vertex.key, vertex.val);
        }
    };
    // reuse between cycle check and topsort
    Vertices.prototype.reset = function () {
        this.stack.len = 0;
        this.result.len = 0;
        var vertices = this.vertices;
        for (var i = 0; i < vertices.length; i++) {
            vertices[i].mark = false;
        }
    };
    Vertices.prototype.visit = function (start, search) {
        var _a = this, stack = _a.stack, result = _a.result, vertices = _a.vertices;
        stack.push(start.id);
        while (stack.len) {
            var index = stack.pop();
            if (index < 0) {
                index = ~index;
                if (search) {
                    result.pop();
                }
                else {
                    result.push(index);
                }
            }
            else {
                var vertex = vertices[index];
                if (vertex.mark) {
                    continue;
                }
                if (search) {
                    result.push(index);
                    if (search === vertex.key) {
                        return;
                    }
                }
                vertex.mark = true;
                stack.push(~index);
                var incoming = vertex.inc;
                if (incoming) {
                    var i = incoming.length;
                    while (i--) {
                        index = incoming[i];
                        if (!vertices[index].mark) {
                            stack.push(index);
                        }
                    }
                }
            }
        }
    };
    return Vertices;
}());
var IntStack = (function () {
    function IntStack() {
        this.stack = [0, 0, 0, 0, 0, 0];
        this.len = 0;
    }
    IntStack.prototype.push = function (n) {
        this.stack[this.len++] = n;
    };
    IntStack.prototype.pop = function () {
        return this.stack[--this.len];
    };
    return IntStack;
}());

exports['default'] = DAG;

Object.defineProperty(exports, '__esModule', { value: true });

});
enifed('ember-application/index', ['exports', 'ember-application/initializers/dom-templates', 'ember-application/system/application', 'ember-application/system/application-instance', 'ember-application/system/resolver', 'ember-application/system/engine', 'ember-application/system/engine-instance', 'ember-application/system/engine-parent'], function (exports, _emberApplicationInitializersDomTemplates, _emberApplicationSystemApplication, _emberApplicationSystemApplicationInstance, _emberApplicationSystemResolver, _emberApplicationSystemEngine, _emberApplicationSystemEngineInstance, _emberApplicationSystemEngineParent) {
  /**
  @module ember
  @submodule ember-application
  */

  'use strict';

  exports.Application = _emberApplicationSystemApplication.default;
  exports.ApplicationInstance = _emberApplicationSystemApplicationInstance.default;
  exports.Resolver = _emberApplicationSystemResolver.default;
  exports.Engine = _emberApplicationSystemEngine.default;
  exports.EngineInstance = _emberApplicationSystemEngineInstance.default;
  exports.getEngineParent = _emberApplicationSystemEngineParent.getEngineParent;
  exports.setEngineParent = _emberApplicationSystemEngineParent.setEngineParent;

  // add domTemplates initializer (only does something if `ember-template-compiler`
  // is loaded already)
});
enifed('ember-application/initializers/dom-templates', ['exports', 'require', 'ember-glimmer', 'ember-environment', 'ember-application/system/application'], function (exports, _require, _emberGlimmer, _emberEnvironment, _emberApplicationSystemApplication) {
  'use strict';

  var bootstrap = function () {};

  _emberApplicationSystemApplication.default.initializer({
    name: 'domTemplates',
    initialize: function () {
      var bootstrapModuleId = 'ember-template-compiler/system/bootstrap';
      var context = undefined;
      if (_emberEnvironment.environment.hasDOM && _require.has(bootstrapModuleId)) {
        bootstrap = _require.default(bootstrapModuleId).default;
        context = document;
      }

      bootstrap({ context: context, hasTemplate: _emberGlimmer.hasTemplate, setTemplate: _emberGlimmer.setTemplate });
    }
  });
});
enifed('ember-application/system/application-instance', ['exports', 'ember-utils', 'ember-metal', 'ember-runtime', 'ember-environment', 'ember-views', 'ember-application/system/engine-instance'], function (exports, _emberUtils, _emberMetal, _emberRuntime, _emberEnvironment, _emberViews, _emberApplicationSystemEngineInstance) {
  /**
  @module ember
  @submodule ember-application
  */

  'use strict';

  var BootOptions = undefined;

  /**
    The `ApplicationInstance` encapsulates all of the stateful aspects of a
    running `Application`.
  
    At a high-level, we break application boot into two distinct phases:
  
    * Definition time, where all of the classes, templates, and other
      dependencies are loaded (typically in the browser).
    * Run time, where we begin executing the application once everything
      has loaded.
  
    Definition time can be expensive and only needs to happen once since it is
    an idempotent operation. For example, between test runs and FastBoot
    requests, the application stays the same. It is only the state that we want
    to reset.
  
    That state is what the `ApplicationInstance` manages: it is responsible for
    creating the container that contains all application state, and disposing of
    it once the particular test run or FastBoot request has finished.
  
    @public
    @class Ember.ApplicationInstance
    @extends Ember.EngineInstance
  */

  var ApplicationInstance = _emberApplicationSystemEngineInstance.default.extend({
    /**
      The `Application` for which this is an instance.
       @property {Ember.Application} application
      @private
    */
    application: null,

    /**
      The DOM events for which the event dispatcher should listen.
       By default, the application's `Ember.EventDispatcher` listens
      for a set of standard DOM events, such as `mousedown` and
      `keyup`, and delegates them to your application's `Ember.View`
      instances.
       @private
      @property {Object} customEvents
    */
    customEvents: null,

    /**
      The root DOM element of the Application as an element or a
      [jQuery-compatible selector
      string](http://api.jquery.com/category/selectors/).
       @private
      @property {String|DOMElement} rootElement
    */
    rootElement: null,

    init: function () {
      this._super.apply(this, arguments);

      // Register this instance in the per-instance registry.
      //
      // Why do we need to register the instance in the first place?
      // Because we need a good way for the root route (a.k.a ApplicationRoute)
      // to notify us when it has created the root-most view. That view is then
      // appended to the rootElement, in the case of apps, to the fixture harness
      // in tests, or rendered to a string in the case of FastBoot.
      this.register('-application-instance:main', this, { instantiate: false });
    },

    /**
      Overrides the base `EngineInstance._bootSync` method with concerns relevant
      to booting application (instead of engine) instances.
       This method should only contain synchronous boot concerns. Asynchronous
      boot concerns should eventually be moved to the `boot` method, which
      returns a promise.
       Until all boot code has been made asynchronous, we need to continue to
      expose this method for use *internally* in places where we need to boot an
      instance synchronously.
       @private
    */
    _bootSync: function (options) {
      if (this._booted) {
        return this;
      }

      options = new BootOptions(options);

      this.setupRegistry(options);

      if (options.rootElement) {
        this.rootElement = options.rootElement;
      } else {
        this.rootElement = this.application.rootElement;
      }

      if (options.location) {
        var router = _emberMetal.get(this, 'router');
        _emberMetal.set(router, 'location', options.location);
      }

      this.application.runInstanceInitializers(this);

      if (options.isInteractive) {
        this.setupEventDispatcher();
      }

      this._booted = true;

      return this;
    },

    setupRegistry: function (options) {
      this.constructor.setupRegistry(this.__registry__, options);
    },

    router: _emberMetal.computed(function () {
      return this.lookup('router:main');
    }).readOnly(),

    /**
      This hook is called by the root-most Route (a.k.a. the ApplicationRoute)
      when it has finished creating the root View. By default, we simply take the
      view and append it to the `rootElement` specified on the Application.
       In cases like FastBoot and testing, we can override this hook and implement
      custom behavior, such as serializing to a string and sending over an HTTP
      socket rather than appending to DOM.
       @param view {Ember.View} the root-most view
      @private
    */
    didCreateRootView: function (view) {
      view.appendTo(this.rootElement);
    },

    /**
      Tells the router to start routing. The router will ask the location for the
      current URL of the page to determine the initial URL to start routing to.
      To start the app at a specific URL, call `handleURL` instead.
       @private
    */
    startRouting: function () {
      var router = _emberMetal.get(this, 'router');
      router.startRouting();
      this._didSetupRouter = true;
    },

    /**
      @private
       Sets up the router, initializing the child router and configuring the
      location before routing begins.
       Because setup should only occur once, multiple calls to `setupRouter`
      beyond the first call have no effect.
    */
    setupRouter: function () {
      if (this._didSetupRouter) {
        return;
      }
      this._didSetupRouter = true;

      var router = _emberMetal.get(this, 'router');
      router.setupRouter();
    },

    /**
      Directs the router to route to a particular URL. This is useful in tests,
      for example, to tell the app to start at a particular URL.
       @param url {String} the URL the router should route to
      @private
    */
    handleURL: function (url) {
      var router = _emberMetal.get(this, 'router');

      this.setupRouter();
      return router.handleURL(url);
    },

    /**
      @private
    */
    setupEventDispatcher: function () {
      var dispatcher = this.lookup('event_dispatcher:main');
      var applicationCustomEvents = _emberMetal.get(this.application, 'customEvents');
      var instanceCustomEvents = _emberMetal.get(this, 'customEvents');

      var customEvents = _emberUtils.assign({}, applicationCustomEvents, instanceCustomEvents);
      dispatcher.setup(customEvents, this.rootElement);

      return dispatcher;
    },

    /**
      Returns the current URL of the app instance. This is useful when your
      app does not update the browsers URL bar (i.e. it uses the `'none'`
      location adapter).
       @public
      @return {String} the current URL
    */
    getURL: function () {
      var router = _emberMetal.get(this, 'router');
      return _emberMetal.get(router, 'url');
    },

    // `instance.visit(url)` should eventually replace `instance.handleURL()`;
    // the test helpers can probably be switched to use this implementation too

    /**
      Navigate the instance to a particular URL. This is useful in tests, for
      example, or to tell the app to start at a particular URL. This method
      returns a promise that resolves with the app instance when the transition
      is complete, or rejects if the transion was aborted due to an error.
       @public
      @param url {String} the destination URL
      @return {Promise}
    */
    visit: function (url) {
      var _this = this;

      this.setupRouter();

      var bootOptions = this.__container__.lookup('-environment:main');

      var router = _emberMetal.get(this, 'router');

      var handleTransitionResolve = function () {
        if (!bootOptions.options.shouldRender) {
          // No rendering is needed, and routing has completed, simply return.
          return _this;
        } else {
          return new _emberRuntime.RSVP.Promise(function (resolve) {
            // Resolve once rendering is completed. `router.handleURL` returns the transition (as a thennable)
            // which resolves once the transition is completed, but the transition completion only queues up
            // a scheduled revalidation (into the `render` queue) in the Renderer.
            //
            // This uses `run.schedule('afterRender', ....)` to resolve after that rendering has completed.
            _emberMetal.run.schedule('afterRender', null, resolve, _this);
          });
        }
      };

      var handleTransitionReject = function (error) {
        if (error.error) {
          throw error.error;
        } else if (error.name === 'TransitionAborted' && router.router.activeTransition) {
          return router.router.activeTransition.then(handleTransitionResolve, handleTransitionReject);
        } else if (error.name === 'TransitionAborted') {
          throw new Error(error.message);
        } else {
          throw error;
        }
      };

      var location = _emberMetal.get(router, 'location');

      // Keeps the location adapter's internal URL in-sync
      location.setURL(url);

      // getURL returns the set url with the rootURL stripped off
      return router.handleURL(location.getURL()).then(handleTransitionResolve, handleTransitionReject);
    }
  });

  ApplicationInstance.reopenClass({
    /**
     @private
     @method setupRegistry
     @param {Registry} registry
     @param {BootOptions} options
    */
    setupRegistry: function (registry) {
      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      if (!options.toEnvironment) {
        options = new BootOptions(options);
      }

      registry.register('-environment:main', options.toEnvironment(), { instantiate: false });
      registry.register('service:-document', options.document, { instantiate: false });

      this._super(registry, options);
    }
  });

  /**
    A list of boot-time configuration options for customizing the behavior of
    an `Ember.ApplicationInstance`.
  
    This is an interface class that exists purely to document the available
    options; you do not need to construct it manually. Simply pass a regular
    JavaScript object containing the desired options into methods that require
    one of these options object:
  
    ```javascript
    MyApp.visit("/", { location: "none", rootElement: "#container" });
    ```
  
    Not all combinations of the supported options are valid. See the documentation
    on `Ember.Application#visit` for the supported configurations.
  
    Internal, experimental or otherwise unstable flags are marked as private.
  
    @class BootOptions
    @namespace Ember.ApplicationInstance
    @public
  */
  BootOptions = function BootOptions() {
    var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    /**
      Provide a specific instance of jQuery. This is useful in conjunction with
      the `document` option, as it allows you to use a copy of `jQuery` that is
      appropriately bound to the foreign `document` (e.g. a jsdom).
       This is highly experimental and support very incomplete at the moment.
       @property jQuery
      @type Object
      @default auto-detected
      @private
    */
    this.jQuery = _emberViews.jQuery; // This default is overridable below

    /**
      Interactive mode: whether we need to set up event delegation and invoke
      lifecycle callbacks on Components.
       @property isInteractive
      @type boolean
      @default auto-detected
      @private
    */
    this.isInteractive = _emberEnvironment.environment.hasDOM; // This default is overridable below

    /**
      Run in a full browser environment.
       When this flag is set to `false`, it will disable most browser-specific
      and interactive features. Specifically:
       * It does not use `jQuery` to append the root view; the `rootElement`
        (either specified as a subsequent option or on the application itself)
        must already be an `Element` in the given `document` (as opposed to a
        string selector).
       * It does not set up an `EventDispatcher`.
       * It does not run any `Component` lifecycle hooks (such as `didInsertElement`).
       * It sets the `location` option to `"none"`. (If you would like to use
        the location adapter specified in the app's router instead, you can also
        specify `{ location: null }` to specifically opt-out.)
       @property isBrowser
      @type boolean
      @default auto-detected
      @public
    */
    if (options.isBrowser !== undefined) {
      this.isBrowser = !!options.isBrowser;
    } else {
      this.isBrowser = _emberEnvironment.environment.hasDOM;
    }

    if (!this.isBrowser) {
      this.jQuery = null;
      this.isInteractive = false;
      this.location = 'none';
    }

    /**
      Disable rendering completely.
       When this flag is set to `true`, it will disable the entire rendering
      pipeline. Essentially, this puts the app into "routing-only" mode. No
      templates will be rendered, and no Components will be created.
       @property shouldRender
      @type boolean
      @default true
      @public
    */
    if (options.shouldRender !== undefined) {
      this.shouldRender = !!options.shouldRender;
    } else {
      this.shouldRender = true;
    }

    if (!this.shouldRender) {
      this.jQuery = null;
      this.isInteractive = false;
    }

    /**
      If present, render into the given `Document` object instead of the
      global `window.document` object.
       In practice, this is only useful in non-browser environment or in
      non-interactive mode, because Ember's `jQuery` dependency is
      implicitly bound to the current document, causing event delegation
      to not work properly when the app is rendered into a foreign
      document object (such as an iframe's `contentDocument`).
       In non-browser mode, this could be a "`Document`-like" object as
      Ember only interact with a small subset of the DOM API in non-
      interactive mode. While the exact requirements have not yet been
      formalized, the `SimpleDOM` library's implementation is known to
      work.
       @property document
      @type Document
      @default the global `document` object
      @public
    */
    if (options.document) {
      this.document = options.document;
    } else {
      this.document = typeof document !== 'undefined' ? document : null;
    }

    /**
      If present, overrides the application's `rootElement` property on
      the instance. This is useful for testing environment, where you
      might want to append the root view to a fixture area.
       In non-browser mode, because Ember does not have access to jQuery,
      this options must be specified as a DOM `Element` object instead of
      a selector string.
       See the documentation on `Ember.Applications`'s `rootElement` for
      details.
       @property rootElement
      @type String|Element
      @default null
      @public
     */
    if (options.rootElement) {
      this.rootElement = options.rootElement;
    }

    // Set these options last to give the user a chance to override the
    // defaults from the "combo" options like `isBrowser` (although in
    // practice, the resulting combination is probably invalid)

    /**
      If present, overrides the router's `location` property with this
      value. This is useful for environments where trying to modify the
      URL would be inappropriate.
       @property location
      @type string
      @default null
      @public
    */
    if (options.location !== undefined) {
      this.location = options.location;
    }

    if (options.jQuery !== undefined) {
      this.jQuery = options.jQuery;
    }

    if (options.isInteractive !== undefined) {
      this.isInteractive = !!options.isInteractive;
    }
  };

  BootOptions.prototype.toEnvironment = function () {
    var env = _emberUtils.assign({}, _emberEnvironment.environment);
    // For compatibility with existing code
    env.hasDOM = this.isBrowser;
    env.isInteractive = this.isInteractive;
    env.options = this;
    return env;
  };

  Object.defineProperty(ApplicationInstance.prototype, 'container', {
    configurable: true,
    enumerable: false,
    get: function () {
      var instance = this;
      return {
        lookup: function () {
          _emberMetal.deprecate('Using `ApplicationInstance.container.lookup` is deprecated. Please use `ApplicationInstance.lookup` instead.', false, {
            id: 'ember-application.app-instance-container',
            until: '3.0.0',
            url: 'http://emberjs.com/deprecations/v2.x/#toc_ember-applicationinstance-container'
          });
          return instance.lookup.apply(instance, arguments);
        }
      };
    }
  });

  Object.defineProperty(ApplicationInstance.prototype, 'registry', {
    configurable: true,
    enumerable: false,
    get: function () {
      return _emberRuntime.buildFakeRegistryWithDeprecations(this, 'ApplicationInstance');
    }
  });

  exports.default = ApplicationInstance;
});
enifed('ember-application/system/application', ['exports', 'ember-utils', 'ember-environment', 'ember-metal', 'ember-runtime', 'ember-views', 'ember-routing', 'ember-application/system/application-instance', 'container', 'ember-application/system/engine', 'ember-glimmer'], function (exports, _emberUtils, _emberEnvironment, _emberMetal, _emberRuntime, _emberViews, _emberRouting, _emberApplicationSystemApplicationInstance, _container, _emberApplicationSystemEngine, _emberGlimmer) {
  /**
  @module ember
  @submodule ember-application
  */
  'use strict';

  exports._resetLegacyAddonWarnings = _resetLegacyAddonWarnings;

  var _templateObject = babelHelpers.taggedTemplateLiteralLoose(['-bucket-cache:main'], ['-bucket-cache:main']);

  var librariesRegistered = false;

  var warnedAboutLegacyViewAddon = false;
  var warnedAboutLegacyControllerAddon = false;

  // For testing

  function _resetLegacyAddonWarnings() {
    warnedAboutLegacyViewAddon = false;
    warnedAboutLegacyControllerAddon = false;
  }

  /**
    An instance of `Ember.Application` is the starting point for every Ember
    application. It helps to instantiate, initialize and coordinate the many
    objects that make up your app.
  
    Each Ember app has one and only one `Ember.Application` object. In fact, the
    very first thing you should do in your application is create the instance:
  
    ```javascript
    window.App = Ember.Application.create();
    ```
  
    Typically, the application object is the only global variable. All other
    classes in your app should be properties on the `Ember.Application` instance,
    which highlights its first role: a global namespace.
  
    For example, if you define a view class, it might look like this:
  
    ```javascript
    App.MyView = Ember.View.extend();
    ```
  
    By default, calling `Ember.Application.create()` will automatically initialize
    your application by calling the `Ember.Application.initialize()` method. If
    you need to delay initialization, you can call your app's `deferReadiness()`
    method. When you are ready for your app to be initialized, call its
    `advanceReadiness()` method.
  
    You can define a `ready` method on the `Ember.Application` instance, which
    will be run by Ember when the application is initialized.
  
    Because `Ember.Application` inherits from `Ember.Namespace`, any classes
    you create will have useful string representations when calling `toString()`.
    See the `Ember.Namespace` documentation for more information.
  
    While you can think of your `Ember.Application` as a container that holds the
    other classes in your application, there are several other responsibilities
    going on under-the-hood that you may want to understand.
  
    ### Event Delegation
  
    Ember uses a technique called _event delegation_. This allows the framework
    to set up a global, shared event listener instead of requiring each view to
    do it manually. For example, instead of each view registering its own
    `mousedown` listener on its associated element, Ember sets up a `mousedown`
    listener on the `body`.
  
    If a `mousedown` event occurs, Ember will look at the target of the event and
    start walking up the DOM node tree, finding corresponding views and invoking
    their `mouseDown` method as it goes.
  
    `Ember.Application` has a number of default events that it listens for, as
    well as a mapping from lowercase events to camel-cased view method names. For
    example, the `keypress` event causes the `keyPress` method on the view to be
    called, the `dblclick` event causes `doubleClick` to be called, and so on.
  
    If there is a bubbling browser event that Ember does not listen for by
    default, you can specify custom events and their corresponding view method
    names by setting the application's `customEvents` property:
  
    ```javascript
    let App = Ember.Application.create({
      customEvents: {
        // add support for the paste event
        paste: 'paste'
      }
    });
    ```
  
    To prevent Ember from setting up a listener for a default event,
    specify the event name with a `null` value in the `customEvents`
    property:
  
    ```javascript
    let App = Ember.Application.create({
      customEvents: {
        // prevent listeners for mouseenter/mouseleave events
        mouseenter: null,
        mouseleave: null
      }
    });
    ```
  
    By default, the application sets up these event listeners on the document
    body. However, in cases where you are embedding an Ember application inside
    an existing page, you may want it to set up the listeners on an element
    inside the body.
  
    For example, if only events inside a DOM element with the ID of `ember-app`
    should be delegated, set your application's `rootElement` property:
  
    ```javascript
    let App = Ember.Application.create({
      rootElement: '#ember-app'
    });
    ```
  
    The `rootElement` can be either a DOM element or a jQuery-compatible selector
    string. Note that *views appended to the DOM outside the root element will
    not receive events.* If you specify a custom root element, make sure you only
    append views inside it!
  
    To learn more about the events Ember components use, see
    [components/handling-events](https://guides.emberjs.com/v2.6.0/components/handling-events/#toc_event-names).
  
    ### Initializers
  
    Libraries on top of Ember can add initializers, like so:
  
    ```javascript
    Ember.Application.initializer({
      name: 'api-adapter',
  
      initialize: function(application) {
        application.register('api-adapter:main', ApiAdapter);
      }
    });
    ```
  
    Initializers provide an opportunity to access the internal registry, which
    organizes the different components of an Ember application. Additionally
    they provide a chance to access the instantiated application. Beyond
    being used for libraries, initializers are also a great way to organize
    dependency injection or setup in your own application.
  
    ### Routing
  
    In addition to creating your application's router, `Ember.Application` is
    also responsible for telling the router when to start routing. Transitions
    between routes can be logged with the `LOG_TRANSITIONS` flag, and more
    detailed intra-transition logging can be logged with
    the `LOG_TRANSITIONS_INTERNAL` flag:
  
    ```javascript
    let App = Ember.Application.create({
      LOG_TRANSITIONS: true, // basic logging of successful transitions
      LOG_TRANSITIONS_INTERNAL: true // detailed logging of all routing steps
    });
    ```
  
    By default, the router will begin trying to translate the current URL into
    application state once the browser emits the `DOMContentReady` event. If you
    need to defer routing, you can call the application's `deferReadiness()`
    method. Once routing can begin, call the `advanceReadiness()` method.
  
    If there is any setup required before routing begins, you can implement a
    `ready()` method on your app that will be invoked immediately before routing
    begins.
  
    @class Application
    @namespace Ember
    @extends Ember.Engine
    @uses RegistryProxyMixin
    @public
  */

  var Application = _emberApplicationSystemEngine.default.extend({
    _suppressDeferredDeprecation: true,

    /**
      The root DOM element of the Application. This can be specified as an
      element or a
      [jQuery-compatible selector string](http://api.jquery.com/category/selectors/).
       This is the element that will be passed to the Application's,
      `eventDispatcher`, which sets up the listeners for event delegation. Every
      view in your application should be a child of the element you specify here.
       @property rootElement
      @type DOMElement
      @default 'body'
      @public
    */
    rootElement: 'body',

    /**
      The `Ember.EventDispatcher` responsible for delegating events to this
      application's views.
       The event dispatcher is created by the application at initialization time
      and sets up event listeners on the DOM element described by the
      application's `rootElement` property.
       See the documentation for `Ember.EventDispatcher` for more information.
       @property eventDispatcher
      @type Ember.EventDispatcher
      @default null
      @public
    */
    eventDispatcher: null,

    /**
      The DOM events for which the event dispatcher should listen.
       By default, the application's `Ember.EventDispatcher` listens
      for a set of standard DOM events, such as `mousedown` and
      `keyup`, and delegates them to your application's `Ember.View`
      instances.
       If you would like additional bubbling events to be delegated to your
      views, set your `Ember.Application`'s `customEvents` property
      to a hash containing the DOM event name as the key and the
      corresponding view method name as the value. Setting an event to
      a value of `null` will prevent a default event listener from being
      added for that event.
       To add new events to be listened to:
       ```javascript
      let App = Ember.Application.create({
        customEvents: {
          // add support for the paste event
          paste: 'paste'
        }
      });
      ```
       To prevent default events from being listened to:
       ```javascript
      let App = Ember.Application.create({
        customEvents: {
          // remove support for mouseenter / mouseleave events
          mouseenter: null,
          mouseleave: null
        }
      });
      ```
      @property customEvents
      @type Object
      @default null
      @public
    */
    customEvents: null,

    /**
      Whether the application should automatically start routing and render
      templates to the `rootElement` on DOM ready. While default by true,
      other environments such as FastBoot or a testing harness can set this
      property to `false` and control the precise timing and behavior of the boot
      process.
       @property autoboot
      @type Boolean
      @default true
      @private
    */
    autoboot: true,

    /**
      Whether the application should be configured for the legacy "globals mode".
      Under this mode, the Application object serves as a global namespace for all
      classes.
       ```javascript
      let App = Ember.Application.create({
        ...
      });
       App.Router.reopen({
        location: 'none'
      });
       App.Router.map({
        ...
      });
       App.MyComponent = Ember.Component.extend({
        ...
      });
      ```
       This flag also exposes other internal APIs that assumes the existence of
      a special "default instance", like `App.__container__.lookup(...)`.
       This option is currently not configurable, its value is derived from
      the `autoboot` flag â€“ disabling `autoboot` also implies opting-out of
      globals mode support, although they are ultimately orthogonal concerns.
       Some of the global modes features are already deprecated in 1.x. The
      existence of this flag is to untangle the globals mode code paths from
      the autoboot code paths, so that these legacy features can be reviewed
      for deprecation/removal separately.
       Forcing the (autoboot=true, _globalsMode=false) here and running the tests
      would reveal all the places where we are still relying on these legacy
      behavior internally (mostly just tests).
       @property _globalsMode
      @type Boolean
      @default true
      @private
    */
    _globalsMode: true,

    init: function (options) {
      this._super.apply(this, arguments);

      if (!this.$) {
        this.$ = _emberViews.jQuery;
      }

      registerLibraries();
      logLibraryVersions();

      // Start off the number of deferrals at 1. This will be decremented by
      // the Application's own `boot` method.
      this._readinessDeferrals = 1;
      this._booted = false;

      this.autoboot = this._globalsMode = !!this.autoboot;

      if (this._globalsMode) {
        this._prepareForGlobalsMode();
      }

      if (this.autoboot) {
        this.waitForDOMReady();
      }
    },

    /**
      Create an ApplicationInstance for this application.
       @private
      @method buildInstance
      @return {Ember.ApplicationInstance} the application instance
    */
    buildInstance: function () {
      var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      options.base = this;
      options.application = this;
      return _emberApplicationSystemApplicationInstance.default.create(options);
    },

    /**
      Enable the legacy globals mode by allowing this application to act
      as a global namespace. See the docs on the `_globalsMode` property
      for details.
       Most of these features are already deprecated in 1.x, so we can
      stop using them internally and try to remove them.
       @private
      @method _prepareForGlobalsMode
    */
    _prepareForGlobalsMode: function () {
      // Create subclass of Ember.Router for this Application instance.
      // This is to ensure that someone reopening `App.Router` does not
      // tamper with the default `Ember.Router`.
      this.Router = (this.Router || _emberRouting.Router).extend();

      this._buildDeprecatedInstance();
    },

    /*
      Build the deprecated instance for legacy globals mode support.
      Called when creating and resetting the application.
       This is orthogonal to autoboot: the deprecated instance needs to
      be created at Application construction (not boot) time to expose
      App.__container__. If autoboot sees that this instance exists,
      it will continue booting it to avoid doing unncessary work (as
      opposed to building a new instance at boot time), but they are
      otherwise unrelated.
       @private
      @method _buildDeprecatedInstance
    */
    _buildDeprecatedInstance: function () {
      // Build a default instance
      var instance = this.buildInstance();

      // Legacy support for App.__container__ and other global methods
      // on App that rely on a single, default instance.
      this.__deprecatedInstance__ = instance;
      this.__container__ = instance.__container__;
    },

    /**
      Automatically kick-off the boot process for the application once the
      DOM has become ready.
       The initialization itself is scheduled on the actions queue which
      ensures that code-loading finishes before booting.
       If you are asynchronously loading code, you should call `deferReadiness()`
      to defer booting, and then call `advanceReadiness()` once all of your code
      has finished loading.
       @private
      @method waitForDOMReady
    */
    waitForDOMReady: function () {
      if (!this.$ || this.$.isReady) {
        _emberMetal.run.schedule('actions', this, 'domReady');
      } else {
        this.$().ready(_emberMetal.run.bind(this, 'domReady'));
      }
    },

    /**
      This is the autoboot flow:
       1. Boot the app by calling `this.boot()`
      2. Create an instance (or use the `__deprecatedInstance__` in globals mode)
      3. Boot the instance by calling `instance.boot()`
      4. Invoke the `App.ready()` callback
      5. Kick-off routing on the instance
       Ideally, this is all we would need to do:
       ```javascript
      _autoBoot() {
        this.boot().then(() => {
          let instance = (this._globalsMode) ? this.__deprecatedInstance__ : this.buildInstance();
          return instance.boot();
        }).then((instance) => {
          App.ready();
          instance.startRouting();
        });
      }
      ```
       Unfortunately, we cannot actually write this because we need to participate
      in the "synchronous" boot process. While the code above would work fine on
      the initial boot (i.e. DOM ready), when `App.reset()` is called, we need to
      boot a new instance synchronously (see the documentation on `_bootSync()`
      for details).
       Because of this restriction, the actual logic of this method is located
      inside `didBecomeReady()`.
       @private
      @method domReady
    */
    domReady: function () {
      if (this.isDestroyed) {
        return;
      }

      this._bootSync();

      // Continues to `didBecomeReady`
    },

    /**
      Use this to defer readiness until some condition is true.
       Example:
       ```javascript
      let App = Ember.Application.create();
       App.deferReadiness();
       // Ember.$ is a reference to the jQuery object/function
      Ember.$.getJSON('/auth-token', function(token) {
        App.token = token;
        App.advanceReadiness();
      });
      ```
       This allows you to perform asynchronous setup logic and defer
      booting your application until the setup has finished.
       However, if the setup requires a loading UI, it might be better
      to use the router for this purpose.
       @method deferReadiness
      @public
    */
    deferReadiness: function () {
      _emberMetal.assert('You must call deferReadiness on an instance of Ember.Application', this instanceof Application);
      _emberMetal.assert('You cannot defer readiness since the `ready()` hook has already been called.', this._readinessDeferrals > 0);
      this._readinessDeferrals++;
    },

    /**
      Call `advanceReadiness` after any asynchronous setup logic has completed.
      Each call to `deferReadiness` must be matched by a call to `advanceReadiness`
      or the application will never become ready and routing will not begin.
       @method advanceReadiness
      @see {Ember.Application#deferReadiness}
      @public
    */
    advanceReadiness: function () {
      _emberMetal.assert('You must call advanceReadiness on an instance of Ember.Application', this instanceof Application);
      this._readinessDeferrals--;

      if (this._readinessDeferrals === 0) {
        _emberMetal.run.once(this, this.didBecomeReady);
      }
    },

    /**
      Initialize the application and return a promise that resolves with the `Ember.Application`
      object when the boot process is complete.
       Run any application initializers and run the application load hook. These hooks may
      choose to defer readiness. For example, an authentication hook might want to defer
      readiness until the auth token has been retrieved.
       By default, this method is called automatically on "DOM ready"; however, if autoboot
      is disabled, this is automatically called when the first application instance is
      created via `visit`.
       @private
      @method boot
      @return {Promise<Ember.Application,Error>}
    */
    boot: function () {
      if (this._bootPromise) {
        return this._bootPromise;
      }

      try {
        this._bootSync();
      } catch (_) {
        // Ignore th error: in the asynchronous boot path, the error is already reflected
        // in the promise rejection
      }

      return this._bootPromise;
    },

    /**
      Unfortunately, a lot of existing code assumes the booting process is
      "synchronous". Specifically, a lot of tests assumes the last call to
      `app.advanceReadiness()` or `app.reset()` will result in the app being
      fully-booted when the current runloop completes.
       We would like new code (like the `visit` API) to stop making this assumption,
      so we created the asynchronous version above that returns a promise. But until
      we have migrated all the code, we would have to expose this method for use
      *internally* in places where we need to boot an app "synchronously".
       @private
    */
    _bootSync: function () {
      if (this._booted) {
        return;
      }

      // Even though this returns synchronously, we still need to make sure the
      // boot promise exists for book-keeping purposes: if anything went wrong in
      // the boot process, we need to store the error as a rejection on the boot
      // promise so that a future caller of `boot()` can tell what failed.
      var defer = this._bootResolver = new _emberRuntime.RSVP.defer();
      this._bootPromise = defer.promise;

      try {
        this.runInitializers();
        _emberRuntime.runLoadHooks('application', this);
        this.advanceReadiness();
        // Continues to `didBecomeReady`
      } catch (error) {
        // For the asynchronous boot path
        defer.reject(error);

        // For the synchronous boot path
        throw error;
      }
    },

    /**
      Reset the application. This is typically used only in tests. It cleans up
      the application in the following order:
       1. Deactivate existing routes
      2. Destroy all objects in the container
      3. Create a new application container
      4. Re-route to the existing url
       Typical Example:
       ```javascript
      let App;
       run(function() {
        App = Ember.Application.create();
      });
       module('acceptance test', {
        setup: function() {
          App.reset();
        }
      });
       test('first test', function() {
        // App is freshly reset
      });
       test('second test', function() {
        // App is again freshly reset
      });
      ```
       Advanced Example:
       Occasionally you may want to prevent the app from initializing during
      setup. This could enable extra configuration, or enable asserting prior
      to the app becoming ready.
       ```javascript
      let App;
       run(function() {
        App = Ember.Application.create();
      });
       module('acceptance test', {
        setup: function() {
          run(function() {
            App.reset();
            App.deferReadiness();
          });
        }
      });
       test('first test', function() {
        ok(true, 'something before app is initialized');
         run(function() {
          App.advanceReadiness();
        });
         ok(true, 'something after app is initialized');
      });
      ```
       @method reset
      @public
    */
    reset: function () {
      _emberMetal.assert('Calling reset() on instances of `Ember.Application` is not\n            supported when globals mode is disabled; call `visit()` to\n            create new `Ember.ApplicationInstance`s and dispose them\n            via their `destroy()` method instead.', this._globalsMode && this.autoboot);

      var instance = this.__deprecatedInstance__;

      this._readinessDeferrals = 1;
      this._bootPromise = null;
      this._bootResolver = null;
      this._booted = false;

      function handleReset() {
        _emberMetal.run(instance, 'destroy');
        this._buildDeprecatedInstance();
        _emberMetal.run.schedule('actions', this, '_bootSync');
      }

      _emberMetal.run.join(this, handleReset);
    },

    /**
      @private
      @method didBecomeReady
    */
    didBecomeReady: function () {
      try {
        // TODO: Is this still needed for _globalsMode = false?
        if (!_emberMetal.isTesting()) {
          // Eagerly name all classes that are already loaded
          _emberRuntime.Namespace.processAll();
          _emberRuntime.setNamespaceSearchDisabled(true);
        }

        // See documentation on `_autoboot()` for details
        if (this.autoboot) {
          var instance = undefined;

          if (this._globalsMode) {
            // If we already have the __deprecatedInstance__ lying around, boot it to
            // avoid unnecessary work
            instance = this.__deprecatedInstance__;
          } else {
            // Otherwise, build an instance and boot it. This is currently unreachable,
            // because we forced _globalsMode to === autoboot; but having this branch
            // allows us to locally toggle that flag for weeding out legacy globals mode
            // dependencies independently
            instance = this.buildInstance();
          }

          instance._bootSync();

          // TODO: App.ready() is not called when autoboot is disabled, is this correct?
          this.ready();

          instance.startRouting();
        }

        // For the asynchronous boot path
        this._bootResolver.resolve(this);

        // For the synchronous boot path
        this._booted = true;
      } catch (error) {
        // For the asynchronous boot path
        this._bootResolver.reject(error);

        // For the synchronous boot path
        throw error;
      }
    },

    /**
      Called when the Application has become ready, immediately before routing
      begins. The call will be delayed until the DOM has become ready.
       @event ready
      @public
    */
    ready: function () {
      return this;
    },

    // This method must be moved to the application instance object
    willDestroy: function () {
      this._super.apply(this, arguments);
      _emberRuntime.setNamespaceSearchDisabled(false);
      this._booted = false;
      this._bootPromise = null;
      this._bootResolver = null;

      if (_emberRuntime._loaded.application === this) {
        _emberRuntime._loaded.application = undefined;
      }

      if (this._globalsMode && this.__deprecatedInstance__) {
        this.__deprecatedInstance__.destroy();
      }
    },

    /**
      Boot a new instance of `Ember.ApplicationInstance` for the current
      application and navigate it to the given `url`. Returns a `Promise` that
      resolves with the instance when the initial routing and rendering is
      complete, or rejects with any error that occured during the boot process.
       When `autoboot` is disabled, calling `visit` would first cause the
      application to boot, which runs the application initializers.
       This method also takes a hash of boot-time configuration options for
      customizing the instance's behavior. See the documentation on
      `Ember.ApplicationInstance.BootOptions` for details.
       `Ember.ApplicationInstance.BootOptions` is an interface class that exists
      purely to document the available options; you do not need to construct it
      manually. Simply pass a regular JavaScript object containing of the
      desired options:
       ```javascript
      MyApp.visit("/", { location: "none", rootElement: "#container" });
      ```
       ### Supported Scenarios
       While the `BootOptions` class exposes a large number of knobs, not all
      combinations of them are valid; certain incompatible combinations might
      result in unexpected behavior.
       For example, booting the instance in the full browser environment
      while specifying a foriegn `document` object (e.g. `{ isBrowser: true,
      document: iframe.contentDocument }`) does not work correctly today,
      largely due to Ember's jQuery dependency.
       Currently, there are three officially supported scenarios/configurations.
      Usages outside of these scenarios are not guaranteed to work, but please
      feel free to file bug reports documenting your experience and any issues
      you encountered to help expand support.
       #### Browser Applications (Manual Boot)
       The setup is largely similar to how Ember works out-of-the-box. Normally,
      Ember will boot a default instance for your Application on "DOM ready".
      However, you can customize this behavior by disabling `autoboot`.
       For example, this allows you to render a miniture demo of your application
      into a specific area on your marketing website:
       ```javascript
      import MyApp from 'my-app';
       $(function() {
        let App = MyApp.create({ autoboot: false });
         let options = {
          // Override the router's location adapter to prevent it from updating
          // the URL in the address bar
          location: 'none',
           // Override the default `rootElement` on the app to render into a
          // specific `div` on the page
          rootElement: '#demo'
        };
         // Start the app at the special demo URL
        App.visit('/demo', options);
      });
      ````
       Or perhaps you might want to boot two instances of your app on the same
      page for a split-screen multiplayer experience:
       ```javascript
      import MyApp from 'my-app';
       $(function() {
        let App = MyApp.create({ autoboot: false });
         let sessionId = MyApp.generateSessionID();
         let player1 = App.visit(`/matches/join?name=Player+1&session=${sessionId}`, { rootElement: '#left', location: 'none' });
        let player2 = App.visit(`/matches/join?name=Player+2&session=${sessionId}`, { rootElement: '#right', location: 'none' });
         Promise.all([player1, player2]).then(() => {
          // Both apps have completed the initial render
          $('#loading').fadeOut();
        });
      });
      ```
       Do note that each app instance maintains their own registry/container, so
      they will run in complete isolation by default.
       #### Server-Side Rendering (also known as FastBoot)
       This setup allows you to run your Ember app in a server environment using
      Node.js and render its content into static HTML for SEO purposes.
       ```javascript
      const HTMLSerializer = new SimpleDOM.HTMLSerializer(SimpleDOM.voidMap);
       function renderURL(url) {
        let dom = new SimpleDOM.Document();
        let rootElement = dom.body;
        let options = { isBrowser: false, document: dom, rootElement: rootElement };
         return MyApp.visit(options).then(instance => {
          try {
            return HTMLSerializer.serialize(rootElement.firstChild);
          } finally {
            instance.destroy();
          }
        });
      }
      ```
       In this scenario, because Ember does not have access to a global `document`
      object in the Node.js environment, you must provide one explicitly. In practice,
      in the non-browser environment, the stand-in `document` object only need to
      implement a limited subset of the full DOM API. The `SimpleDOM` library is known
      to work.
       Since there is no access to jQuery in the non-browser environment, you must also
      specify a DOM `Element` object in the same `document` for the `rootElement` option
      (as opposed to a selector string like `"body"`).
       See the documentation on the `isBrowser`, `document` and `rootElement` properties
      on `Ember.ApplicationInstance.BootOptions` for details.
       #### Server-Side Resource Discovery
       This setup allows you to run the routing layer of your Ember app in a server
      environment using Node.js and completely disable rendering. This allows you
      to simulate and discover the resources (i.e. AJAX requests) needed to fufill
      a given request and eagerly "push" these resources to the client.
       ```app/initializers/network-service.js
      import BrowserNetworkService from 'app/services/network/browser';
      import NodeNetworkService from 'app/services/network/node';
       // Inject a (hypothetical) service for abstracting all AJAX calls and use
      // the appropiate implementaion on the client/server. This also allows the
      // server to log all the AJAX calls made during a particular request and use
      // that for resource-discovery purpose.
       export function initialize(application) {
        if (window) { // browser
          application.register('service:network', BrowserNetworkService);
        } else { // node
          application.register('service:network', NodeNetworkService);
        }
         application.inject('route', 'network', 'service:network');
      };
       export default {
        name: 'network-service',
        initialize: initialize
      };
      ```
       ```app/routes/post.js
      import Ember from 'ember';
       // An example of how the (hypothetical) service is used in routes.
       export default Ember.Route.extend({
        model(params) {
          return this.network.fetch(`/api/posts/${params.post_id}.json`);
        },
         afterModel(post) {
          if (post.isExternalContent) {
            return this.network.fetch(`/api/external/?url=${post.externalURL}`);
          } else {
            return post;
          }
        }
      });
      ```
       ```javascript
      // Finally, put all the pieces together
       function discoverResourcesFor(url) {
        return MyApp.visit(url, { isBrowser: false, shouldRender: false }).then(instance => {
          let networkService = instance.lookup('service:network');
          return networkService.requests; // => { "/api/posts/123.json": "..." }
        });
      }
      ```
       @public
      @method visit
      @param url {String} The initial URL to navigate to
      @param options {Ember.ApplicationInstance.BootOptions}
      @return {Promise<Ember.ApplicationInstance, Error>}
    */
    visit: function (url, options) {
      var _this = this;

      return this.boot().then(function () {
        var instance = _this.buildInstance();

        return instance.boot(options).then(function () {
          return instance.visit(url);
        }).catch(function (error) {
          _emberMetal.run(instance, 'destroy');
          throw error;
        });
      });
    }
  });

  Object.defineProperty(Application.prototype, 'registry', {
    configurable: true,
    enumerable: false,
    get: function () {
      return _emberRuntime.buildFakeRegistryWithDeprecations(this, 'Application');
    }
  });

  Application.reopenClass({
    /**
      This creates a registry with the default Ember naming conventions.
       It also configures the registry:
       * registered views are created every time they are looked up (they are
        not singletons)
      * registered templates are not factories; the registered value is
        returned directly.
      * the router receives the application as its `namespace` property
      * all controllers receive the router as their `target` and `controllers`
        properties
      * all controllers receive the application as their `namespace` property
      * the application view receives the application controller as its
        `controller` property
      * the application view receives the application template as its
        `defaultTemplate` property
       @method buildRegistry
      @static
      @param {Ember.Application} namespace the application for which to
        build the registry
      @return {Ember.Registry} the built registry
      @private
    */
    buildRegistry: function (application) {
      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      var registry = this._super.apply(this, arguments);

      commonSetupRegistry(registry);

      _emberGlimmer.setupApplicationRegistry(registry);

      return registry;
    }
  });

  function commonSetupRegistry(registry) {
    registry.register('-view-registry:main', { create: function () {
        return _emberUtils.dictionary(null);
      } });

    registry.register('route:basic', _emberRouting.Route);
    registry.register('event_dispatcher:main', _emberViews.EventDispatcher);

    registry.injection('router:main', 'namespace', 'application:main');

    registry.register('location:auto', _emberRouting.AutoLocation);
    registry.register('location:hash', _emberRouting.HashLocation);
    registry.register('location:history', _emberRouting.HistoryLocation);
    registry.register('location:none', _emberRouting.NoneLocation);

    registry.register(_container.privatize(_templateObject), _emberRouting.BucketCache);
  }

  function registerLibraries() {
    if (!librariesRegistered) {
      librariesRegistered = true;

      if (_emberEnvironment.environment.hasDOM && typeof _emberViews.jQuery === 'function') {
        _emberMetal.libraries.registerCoreLibrary('jQuery', _emberViews.jQuery().jquery);
      }
    }
  }

  function logLibraryVersions() {
    if (_emberEnvironment.ENV.LOG_VERSION) {
      // we only need to see this once per Application#init
      _emberEnvironment.ENV.LOG_VERSION = false;
      var libs = _emberMetal.libraries._registry;

      var nameLengths = libs.map(function (item) {
        return _emberMetal.get(item, 'name.length');
      });

      var maxNameLength = Math.max.apply(this, nameLengths);

      _emberMetal.debug('-------------------------------');
      for (var i = 0; i < libs.length; i++) {
        var lib = libs[i];
        var spaces = new Array(maxNameLength - lib.name.length + 1).join(' ');
        _emberMetal.debug([lib.name, spaces, ' : ', lib.version].join(''));
      }
      _emberMetal.debug('-------------------------------');
    }
  }

  exports.default = Application;
});
enifed('ember-application/system/engine-instance', ['exports', 'ember-utils', 'ember-runtime', 'ember-metal', 'container', 'ember-application/system/engine-parent'], function (exports, _emberUtils, _emberRuntime, _emberMetal, _container, _emberApplicationSystemEngineParent) {
  /**
  @module ember
  @submodule ember-application
  */

  'use strict';

  var _templateObject = babelHelpers.taggedTemplateLiteralLoose(['-bucket-cache:main'], ['-bucket-cache:main']);

  /**
    The `EngineInstance` encapsulates all of the stateful aspects of a
    running `Engine`.
  
    @public
    @class Ember.EngineInstance
    @extends Ember.Object
    @uses RegistryProxyMixin
    @uses ContainerProxyMixin
  */

  var EngineInstance = _emberRuntime.Object.extend(_emberRuntime.RegistryProxyMixin, _emberRuntime.ContainerProxyMixin, {
    /**
      The base `Engine` for which this is an instance.
       @property {Ember.Engine} engine
      @private
    */
    base: null,

    init: function () {
      this._super.apply(this, arguments);

      _emberUtils.guidFor(this);

      var base = this.base;

      if (!base) {
        base = this.application;
        this.base = base;
      }

      // Create a per-instance registry that will use the application's registry
      // as a fallback for resolving registrations.
      var registry = this.__registry__ = new _container.Registry({
        fallback: base.__registry__
      });

      // Create a per-instance container from the instance's registry
      this.__container__ = registry.container({ owner: this });

      this._booted = false;
    },

    /**
      Initialize the `Ember.EngineInstance` and return a promise that resolves
      with the instance itself when the boot process is complete.
       The primary task here is to run any registered instance initializers.
       See the documentation on `BootOptions` for the options it takes.
       @private
      @method boot
      @param options {Object}
      @return {Promise<Ember.EngineInstance,Error>}
    */
    boot: function (options) {
      var _this = this;

      if (this._bootPromise) {
        return this._bootPromise;
      }

      this._bootPromise = new _emberRuntime.RSVP.Promise(function (resolve) {
        return resolve(_this._bootSync(options));
      });

      return this._bootPromise;
    },

    /**
      Unfortunately, a lot of existing code assumes booting an instance is
      synchronous â€“ specifically, a lot of tests assume the last call to
      `app.advanceReadiness()` or `app.reset()` will result in a new instance
      being fully-booted when the current runloop completes.
       We would like new code (like the `visit` API) to stop making this
      assumption, so we created the asynchronous version above that returns a
      promise. But until we have migrated all the code, we would have to expose
      this method for use *internally* in places where we need to boot an instance
      synchronously.
       @private
    */
    _bootSync: function (options) {
      if (this._booted) {
        return this;
      }

      _emberMetal.assert('An engine instance\'s parent must be set via `setEngineParent(engine, parent)` prior to calling `engine.boot()`.', _emberApplicationSystemEngineParent.getEngineParent(this));

      this.cloneParentDependencies();

      this.setupRegistry(options);

      this.base.runInstanceInitializers(this);

      this._booted = true;

      return this;
    },

    setupRegistry: function () {
      var options = arguments.length <= 0 || arguments[0] === undefined ? this.__container__.lookup('-environment:main') : arguments[0];

      this.constructor.setupRegistry(this.__registry__, options);
    },

    /**
     Unregister a factory.
      Overrides `RegistryProxy#unregister` in order to clear any cached instances
     of the unregistered factory.
      @public
     @method unregister
     @param {String} fullName
     */
    unregister: function (fullName) {
      this.__container__.reset(fullName);
      this._super.apply(this, arguments);
    },

    /**
      @private
    */
    willDestroy: function () {
      this._super.apply(this, arguments);
      _emberMetal.run(this.__container__, 'destroy');
    },

    /**
      Build a new `Ember.EngineInstance` that's a child of this instance.
       Engines must be registered by name with their parent engine
      (or application).
       @private
      @method buildChildEngineInstance
      @param name {String} the registered name of the engine.
      @param options {Object} options provided to the engine instance.
      @return {Ember.EngineInstance,Error}
    */
    buildChildEngineInstance: function (name) {
      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      var Engine = this.lookup('engine:' + name);

      if (!Engine) {
        throw new _emberMetal.Error('You attempted to mount the engine \'' + name + '\', but it is not registered with its parent.');
      }

      var engineInstance = Engine.buildInstance(options);

      _emberApplicationSystemEngineParent.setEngineParent(engineInstance, this);

      return engineInstance;
    },

    /**
      Clone dependencies shared between an engine instance and its parent.
       @private
      @method cloneParentDependencies
    */
    cloneParentDependencies: function () {
      var _this2 = this;

      var parent = _emberApplicationSystemEngineParent.getEngineParent(this);

      var registrations = ['route:basic', 'event_dispatcher:main', 'service:-routing', 'service:-glimmer-environment'];

      registrations.forEach(function (key) {
        return _this2.register(key, parent.resolveRegistration(key));
      });

      var env = parent.lookup('-environment:main');
      this.register('-environment:main', env, { instantiate: false });

      var singletons = ['router:main', _container.privatize(_templateObject), '-view-registry:main', 'renderer:-' + (env.isInteractive ? 'dom' : 'inert')];

      singletons.forEach(function (key) {
        return _this2.register(key, parent.lookup(key), { instantiate: false });
      });

      this.inject('view', '_environment', '-environment:main');
      this.inject('route', '_environment', '-environment:main');
    }
  });

  EngineInstance.reopenClass({
    /**
     @private
     @method setupRegistry
     @param {Registry} registry
     @param {BootOptions} options
     */
    setupRegistry: function (registry, options) {
      // when no options/environment is present, do nothing
      if (!options) {
        return;
      }

      registry.injection('view', '_environment', '-environment:main');
      registry.injection('route', '_environment', '-environment:main');

      if (options.isInteractive) {
        registry.injection('view', 'renderer', 'renderer:-dom');
        registry.injection('component', 'renderer', 'renderer:-dom');
      } else {
        registry.injection('view', 'renderer', 'renderer:-inert');
        registry.injection('component', 'renderer', 'renderer:-inert');
      }
    }
  });

  exports.default = EngineInstance;
});
enifed('ember-application/system/engine-parent', ['exports', 'ember-utils'], function (exports, _emberUtils) {
  'use strict';

  exports.getEngineParent = getEngineParent;
  exports.setEngineParent = setEngineParent;
  var ENGINE_PARENT = _emberUtils.symbol('ENGINE_PARENT');

  exports.ENGINE_PARENT = ENGINE_PARENT;
  /**
    `getEngineParent` retrieves an engine instance's parent instance.
  
    @method getEngineParent
    @param {EngineInstance} engine An engine instance.
    @return {EngineInstance} The parent engine instance.
    @for Ember
    @public
  */

  function getEngineParent(engine) {
    return engine[ENGINE_PARENT];
  }

  /**
    `setEngineParent` sets an engine instance's parent instance.
  
    @method setEngineParent
    @param {EngineInstance} engine An engine instance.
    @param {EngineInstance} parent The parent engine instance.
    @private
  */

  function setEngineParent(engine, parent) {
    engine[ENGINE_PARENT] = parent;
  }
});
enifed('ember-application/system/engine', ['exports', 'ember-utils', 'ember-runtime', 'container', 'dag-map', 'ember-metal', 'ember-application/system/resolver', 'ember-application/system/engine-instance', 'ember-routing', 'ember-extension-support', 'ember-views', 'ember-glimmer'], function (exports, _emberUtils, _emberRuntime, _container, _dagMap, _emberMetal, _emberApplicationSystemResolver, _emberApplicationSystemEngineInstance, _emberRouting, _emberExtensionSupport, _emberViews, _emberGlimmer) {
  /**
  @module ember
  @submodule ember-application
  */
  'use strict';

  var _templateObject = babelHelpers.taggedTemplateLiteralLoose(['-bucket-cache:main'], ['-bucket-cache:main']);

  function props(obj) {
    var properties = [];

    for (var key in obj) {
      properties.push(key);
    }

    return properties;
  }

  /**
    The `Engine` class contains core functionality for both applications and
    engines.
  
    Each engine manages a registry that's used for dependency injection and
    exposed through `RegistryProxy`.
  
    Engines also manage initializers and instance initializers.
  
    Engines can spawn `EngineInstance` instances via `buildInstance()`.
  
    @class Engine
    @namespace Ember
    @extends Ember.Namespace
    @uses RegistryProxy
    @public
  */
  var Engine = _emberRuntime.Namespace.extend(_emberRuntime.RegistryProxyMixin, {
    init: function () {
      this._super.apply(this, arguments);

      this.buildRegistry();
    },

    /**
      A private flag indicating whether an engine's initializers have run yet.
       @private
      @property _initializersRan
    */
    _initializersRan: false,

    /**
      Ensure that initializers are run once, and only once, per engine.
       @private
      @method ensureInitializers
    */
    ensureInitializers: function () {
      if (!this._initializersRan) {
        this.runInitializers();
        this._initializersRan = true;
      }
    },

    /**
      Create an EngineInstance for this engine.
       @private
      @method buildInstance
      @return {Ember.EngineInstance} the engine instance
    */
    buildInstance: function () {
      var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      this.ensureInitializers();
      options.base = this;
      return _emberApplicationSystemEngineInstance.default.create(options);
    },

    /**
      Build and configure the registry for the current engine.
       @private
      @method buildRegistry
      @return {Ember.Registry} the configured registry
    */
    buildRegistry: function () {
      var registry = this.__registry__ = this.constructor.buildRegistry(this);

      return registry;
    },

    /**
      @private
      @method initializer
    */
    initializer: function (options) {
      this.constructor.initializer(options);
    },

    /**
      @private
      @method instanceInitializer
    */
    instanceInitializer: function (options) {
      this.constructor.instanceInitializer(options);
    },

    /**
      @private
      @method runInitializers
    */
    runInitializers: function () {
      var _this = this;

      this._runInitializer('initializers', function (name, initializer) {
        _emberMetal.assert('No application initializer named \'' + name + '\'', !!initializer);
        if (initializer.initialize.length === 2) {
          _emberMetal.deprecate('The `initialize` method for Application initializer \'' + name + '\' should take only one argument - `App`, an instance of an `Application`.', false, {
            id: 'ember-application.app-initializer-initialize-arguments',
            until: '3.0.0',
            url: 'http://emberjs.com/deprecations/v2.x/#toc_initializer-arity'
          });

          initializer.initialize(_this.__registry__, _this);
        } else {
          initializer.initialize(_this);
        }
      });
    },

    /**
      @private
      @since 1.12.0
      @method runInstanceInitializers
    */
    runInstanceInitializers: function (instance) {
      this._runInitializer('instanceInitializers', function (name, initializer) {
        _emberMetal.assert('No instance initializer named \'' + name + '\'', !!initializer);
        initializer.initialize(instance);
      });
    },

    _runInitializer: function (bucketName, cb) {
      var initializersByName = _emberMetal.get(this.constructor, bucketName);
      var initializers = props(initializersByName);
      var graph = new _dagMap.default();
      var initializer = undefined;

      for (var i = 0; i < initializers.length; i++) {
        initializer = initializersByName[initializers[i]];
        graph.add(initializer.name, initializer, initializer.before, initializer.after);
      }

      graph.topsort(cb);
    }
  });

  Engine.reopenClass({
    initializers: new _emberUtils.EmptyObject(),
    instanceInitializers: new _emberUtils.EmptyObject(),

    /**
      The goal of initializers should be to register dependencies and injections.
      This phase runs once. Because these initializers may load code, they are
      allowed to defer application readiness and advance it. If you need to access
      the container or store you should use an InstanceInitializer that will be run
      after all initializers and therefore after all code is loaded and the app is
      ready.
       Initializer receives an object which has the following attributes:
      `name`, `before`, `after`, `initialize`. The only required attribute is
      `initialize`, all others are optional.
       * `name` allows you to specify under which name the initializer is registered.
      This must be a unique name, as trying to register two initializers with the
      same name will result in an error.
       ```javascript
      Ember.Application.initializer({
        name: 'namedInitializer',
         initialize: function(application) {
          Ember.debug('Running namedInitializer!');
        }
      });
      ```
       * `before` and `after` are used to ensure that this initializer is ran prior
      or after the one identified by the value. This value can be a single string
      or an array of strings, referencing the `name` of other initializers.
       An example of ordering initializers, we create an initializer named `first`:
       ```javascript
      Ember.Application.initializer({
        name: 'first',
         initialize: function(application) {
          Ember.debug('First initializer!');
        }
      });
       // DEBUG: First initializer!
      ```
       We add another initializer named `second`, specifying that it should run
      after the initializer named `first`:
       ```javascript
      Ember.Application.initializer({
        name: 'second',
        after: 'first',
         initialize: function(application) {
          Ember.debug('Second initializer!');
        }
      });
       // DEBUG: First initializer!
      // DEBUG: Second initializer!
      ```
       Afterwards we add a further initializer named `pre`, this time specifying
      that it should run before the initializer named `first`:
       ```javascript
      Ember.Application.initializer({
        name: 'pre',
        before: 'first',
         initialize: function(application) {
          Ember.debug('Pre initializer!');
        }
      });
       // DEBUG: Pre initializer!
      // DEBUG: First initializer!
      // DEBUG: Second initializer!
      ```
       Finally we add an initializer named `post`, specifying it should run after
      both the `first` and the `second` initializers:
       ```javascript
      Ember.Application.initializer({
        name: 'post',
        after: ['first', 'second'],
         initialize: function(application) {
          Ember.debug('Post initializer!');
        }
      });
       // DEBUG: Pre initializer!
      // DEBUG: First initializer!
      // DEBUG: Second initializer!
      // DEBUG: Post initializer!
      ```
       * `initialize` is a callback function that receives one argument,
        `application`, on which you can operate.
       Example of using `application` to register an adapter:
       ```javascript
      Ember.Application.initializer({
        name: 'api-adapter',
         initialize: function(application) {
          application.register('api-adapter:main', ApiAdapter);
        }
      });
      ```
       @method initializer
      @param initializer {Object}
      @public
    */

    initializer: buildInitializerMethod('initializers', 'initializer'),

    /**
      Instance initializers run after all initializers have run. Because
      instance initializers run after the app is fully set up. We have access
      to the store, container, and other items. However, these initializers run
      after code has loaded and are not allowed to defer readiness.
       Instance initializer receives an object which has the following attributes:
      `name`, `before`, `after`, `initialize`. The only required attribute is
      `initialize`, all others are optional.
       * `name` allows you to specify under which name the instanceInitializer is
      registered. This must be a unique name, as trying to register two
      instanceInitializer with the same name will result in an error.
       ```javascript
      Ember.Application.instanceInitializer({
        name: 'namedinstanceInitializer',
         initialize: function(application) {
          Ember.debug('Running namedInitializer!');
        }
      });
      ```
       * `before` and `after` are used to ensure that this initializer is ran prior
      or after the one identified by the value. This value can be a single string
      or an array of strings, referencing the `name` of other initializers.
       * See Ember.Application.initializer for discussion on the usage of before
      and after.
       Example instanceInitializer to preload data into the store.
       ```javascript
      Ember.Application.initializer({
        name: 'preload-data',
         initialize: function(application) {
          var userConfig, userConfigEncoded, store;
          // We have a HTML escaped JSON representation of the user's basic
          // configuration generated server side and stored in the DOM of the main
          // index.html file. This allows the app to have access to a set of data
          // without making any additional remote calls. Good for basic data that is
          // needed for immediate rendering of the page. Keep in mind, this data,
          // like all local models and data can be manipulated by the user, so it
          // should not be relied upon for security or authorization.
          //
          // Grab the encoded data from the meta tag
          userConfigEncoded = Ember.$('head meta[name=app-user-config]').attr('content');
          // Unescape the text, then parse the resulting JSON into a real object
          userConfig = JSON.parse(unescape(userConfigEncoded));
          // Lookup the store
          store = application.lookup('service:store');
          // Push the encoded JSON into the store
          store.pushPayload(userConfig);
        }
      });
      ```
       @method instanceInitializer
      @param instanceInitializer
      @public
    */
    instanceInitializer: buildInitializerMethod('instanceInitializers', 'instance initializer'),

    /**
      This creates a registry with the default Ember naming conventions.
       It also configures the registry:
       * registered views are created every time they are looked up (they are
        not singletons)
      * registered templates are not factories; the registered value is
        returned directly.
      * the router receives the application as its `namespace` property
      * all controllers receive the router as their `target` and `controllers`
        properties
      * all controllers receive the application as their `namespace` property
      * the application view receives the application controller as its
        `controller` property
      * the application view receives the application template as its
        `defaultTemplate` property
       @method buildRegistry
      @static
      @param {Ember.Application} namespace the application for which to
        build the registry
      @return {Ember.Registry} the built registry
      @private
    */
    buildRegistry: function (namespace) {
      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      var registry = new _container.Registry({
        resolver: resolverFor(namespace)
      });

      registry.set = _emberMetal.set;

      registry.register('application:main', namespace, { instantiate: false });

      commonSetupRegistry(registry);
      _emberGlimmer.setupEngineRegistry(registry);

      return registry;
    },

    /**
      Set this to provide an alternate class to `Ember.DefaultResolver`
        @deprecated Use 'Resolver' instead
      @property resolver
      @public
    */
    resolver: null,

    /**
      Set this to provide an alternate class to `Ember.DefaultResolver`
       @property resolver
      @public
    */
    Resolver: null
  });

  /**
    This function defines the default lookup rules for container lookups:
  
    * templates are looked up on `Ember.TEMPLATES`
    * other names are looked up on the application after classifying the name.
      For example, `controller:post` looks up `App.PostController` by default.
    * if the default lookup fails, look for registered classes on the container
  
    This allows the application to register default injections in the container
    that could be overridden by the normal naming convention.
  
    @private
    @method resolverFor
    @param {Ember.Namespace} namespace the namespace to look for classes
    @return {*} the resolved value for a given lookup
  */
  function resolverFor(namespace) {
    var ResolverClass = namespace.get('Resolver') || _emberApplicationSystemResolver.default;

    return ResolverClass.create({
      namespace: namespace
    });
  }

  function buildInitializerMethod(bucketName, humanName) {
    return function (initializer) {
      // If this is the first initializer being added to a subclass, we are going to reopen the class
      // to make sure we have a new `initializers` object, which extends from the parent class' using
      