'use strict';

const common = require('../common');

if (!common.hasCrypto) {
  common.skip('missing crypto');
  return;
}

const assert = require('assert');
const https = require('https');
const fs = require('fs');
const constants = require('constants');

const options = {
  key: fs.readFileSync(common.fixturesDir + '/keys/agent1-key.pem'),
  cert: fs.readFileSync(common.fixturesDir + '/keys/agent1-cert.pem'),
  secureOptions: constants.SSL_OP_NO_TICKET
};

// Create TLS1.2 server
https.createServer(options, function(req, res) {
  res.end('ohai');
}).listen(0, function() {
  first(this);
});

// Do request and let agent cache the session
function first(server) {
  const port = server.address().port;
  const req = https.request({
    port: port,
    rejectUnauthorized: false
  }, function(res) {
    res.resume();

    server.close(function() {
      faultyServer(port);
    });
  });
  req.end();
}

// Create TLS1 server
function faultyServer(port) {
  options.secureProtocol = 'TLSv1_method';
  https.createServer(options, function(req, res) {
    res.end('hello faulty');
  }).listen(port, function() {
    second(this);
  });
}

// Attempt to request using cached session
function second(server, session) {
  const req = https.request({
    port: server.address().port,
    rejectUnauthorized: false
  }, function(res) {
    res.resume();
  });

  // Let it fail
  req.on('error', common.mustCall(function(err) {
    assert(/wrong version number/.test(err.message));

    req.on('close', function() {
      third(server);
    });
  }));
  req.end();
}

// Try one more time - session should be evicted!
function third(server) {
  const req = https.request({
    port: server.address().port,
    rejectUnauthorized: false
  }, function(res) {
    res.resume();
    assert(!req.socket.isSessionReused());
    server.close();
  });
  req.on('error', function(err) {
    // never called
    assert(false);
  });
  req.end();
}
