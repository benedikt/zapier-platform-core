'use strict';

const fs = require('fs');
const path = require('path');

const should = require('should');

const mocky = require('./mocky');

const createFileStasher = require('../../src/tools/create-file-stasher');
const createAppRequestClient = require('../../src/tools/create-app-request-client');
const createInput = require('../../src/tools/create-input');

describe('file upload', () => {
  const testLogger = () => Promise.resolve({});
  const input = createInput({}, {}, testLogger);

  const rpc = mocky.makeRpc();
  const stashFile = createFileStasher({ _zapier: { rpc } });

  it('should upload a standard blob of text', (done) => {
    mocky.mockRpcCall(mocky.fakeSignedPostData);
    mocky.mockUpload();

    const file = 'hello world this is a plain blob of text';
    stashFile(file)
      .then((url) => {
        should(url).eql(`${mocky.fakeSignedPostData.url}${mocky.fakeSignedPostData.fields.key}`);
        done();
      })
      .catch(done);
  });

  it('should upload a standard buffer of text', (done) => {
    mocky.mockRpcCall(mocky.fakeSignedPostData);
    mocky.mockUpload();

    const file = new Buffer('hello world this is a buffer of text');
    stashFile(file)
      .then((url) => {
        should(url).eql(`${mocky.fakeSignedPostData.url}${mocky.fakeSignedPostData.fields.key}`);
        done();
      })
      .catch(done);
  });

  it('should fail a standard file stream of text with no length', (done) => {
    mocky.mockRpcCall(mocky.fakeSignedPostData);

    // known failure when "You must provide the Content-Length HTTP header."
    // doesn't support naive "Transfer-Encoding: chunked" ...
    // so purposefully provde knownLength - maybe we could consume/buffer?
    const file = fs.createReadStream(path.join(__dirname, 'test.txt'));
    stashFile(file)
      .then(() => done(new Error('this should have exploded')))
      .catch(err => {
        should(err.message).containEql('knownLength');
        done();
      })
      .catch(done);
  });

  it('should upload a standard file stream of text', (done) => {
    mocky.mockRpcCall(mocky.fakeSignedPostData);
    mocky.mockUpload();

    const file = fs.createReadStream(path.join(__dirname, 'test.txt'));
    const knownLength = fs.readFileSync(path.join(__dirname, 'test.txt')).length;
    stashFile(file, knownLength)
      .then((url) => {
        should(url).eql(`${mocky.fakeSignedPostData.url}${mocky.fakeSignedPostData.fields.key}`);
        done();
      })
      .catch(done);
  });

  it('should upload a raw response', (done) => {
    mocky.mockRpcCall(mocky.fakeSignedPostData);
    mocky.mockUpload();

    const request = createAppRequestClient(input);
    const file = request('http://zapier-httpbin.herokuapp.com/stream-bytes/1024', {raw: true});
    stashFile(file)
      .then((url) => {
        should(url).eql(`${mocky.fakeSignedPostData.url}${mocky.fakeSignedPostData.fields.key}`);
        done();
      })
      .catch(done);
  });

});
