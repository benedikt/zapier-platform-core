'use strict';

const _ = require('lodash');
const path = require('path');
const FormData = require('form-data');
const contentDisposition = require('content-disposition');

const request = require('./request-client-internal');
const ZapierPromise = require('./promise');

const isPromise = (obj) => obj && typeof obj.then === 'function';

const UPLOAD_MAX_SIZE = 1000 * 1000 * 150; // 150mb, in zapier backend too

const LENGTH_ERR_MESSAGE = (
  'We could not calculate the length of your file - please ' +
  'pass a knownLength like z.stashFile(f, knownLength)'
);

const DEFAULT_FILE_NAME = 'unnamedfile';

const uploader = (signedPostData, bufferStringStream, knownLength, filename) => {
  const form = new FormData();

  if (knownLength && knownLength > UPLOAD_MAX_SIZE) {
    return ZapierPromise.reject(new Error(`${knownLength} is too big, ${UPLOAD_MAX_SIZE} is the max`));
  }

  _.each(signedPostData.fields, (value, key) => {
    form.append(key, value);
  });

  filename = path.basename(filename || DEFAULT_FILE_NAME).replace('"', '');

  form.append('Content-Disposition', contentDisposition(filename));

  form.append('file', bufferStringStream, {
    contentType: 'binary/octet-stream', // hardcoded from signedPostData.fields too!
    knownLength,
    filename
  });

  // Try to catch the missing length early, before upload to S3 fails.
  try {
    form.getLengthSync();
  } catch(err) {
    throw new Error(LENGTH_ERR_MESSAGE);
  }

  // Send to S3 with presigned request.
  return request({
    url: signedPostData.url,
    method: 'POST',
    body: form
  })
    .then(res => {
      if (res.status === 204) {
        return `${signedPostData.url}${signedPostData.fields.key}`;
      }
      if (res.content.indexOf('You must provide the Content-Length HTTP header.') !== -1) {
        throw new Error(LENGTH_ERR_MESSAGE);
      }
      throw new Error(`Got ${res.status} - ${res.content}`);
    });
};

// Designed to be some user provided function/api.
const createFileStasher = (input) => {
  const rpc = _.get(input, '_zapier.rpc');

  return (bufferStringStream, knownLength, filename) => {
    // TODO: maybe this could be smart?
    // if it is already a public url, do we pass through? or upload?
    if (!rpc) {
      return ZapierPromise.reject(new Error('rpc is not available'));
    }

    return rpc('get_presigned_upload_post_data')
      .then(result => {
        if (isPromise(bufferStringStream)) {
          return bufferStringStream.then((maybeResponse) => {
            let newBufferStringStream;
            if (_.isString(maybeResponse)) {
              newBufferStringStream = maybeResponse;
            } else if (maybeResponse && maybeResponse.headers) {
              if (maybeResponse.body && typeof maybeResponse.body.pipe === 'function') {
                newBufferStringStream = maybeResponse.body;
              } else {
                newBufferStringStream = maybeResponse.content;
              }

              knownLength = knownLength || maybeResponse.getHeader('content-length');
              const cd = maybeResponse.getHeader('content-disposition');
              if (cd) {
                filename = filename || contentDisposition.parse(cd).parameters.filename;
              }
            } else {
              throw new Error('Cannot stash a Promise wrapped file of unknown type.');
            }
            return uploader(result, newBufferStringStream, knownLength, filename);
          });
        } else {
          return uploader(result, bufferStringStream, knownLength, filename);
        }
      });
  };
};

module.exports = createFileStasher;
