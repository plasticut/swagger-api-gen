#!/usr/bin/env node

import yargs from 'yargs';
import { generateApis } from './generate';

const argv = yargs
  .option('url', {
    type: 'string',
    description: 'Api url',
    required: true,
  })
  .option('splitInterfaces', {
    type: 'boolean',
    description: 'Split interfaces into separate files',
    default: false,
  })
  .option('groupClass', {
    type: 'string',
    description: 'Group apis in single class',
    default: '',
  })
  .option('dest', {
    type: 'string',
    description: 'Destination path',
    default: './generated',
  }).argv;

generateApis(argv)
  .catch(err => {
    console.error(err);
  });
