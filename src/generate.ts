import fetch from "node-fetch";
import * as fs from "fs";
import { ISchemaApi, IApi, IModel, IModelProperty, ModelID, IOperation, IParameter } from "./swagger.interfaces";

async function getJson(path: string): Promise<unknown> {
  const cachePath = `./cache`;
  const filename = `${cachePath}/${path.replace(/[:/.\-?={}]+/g, '')}`;

  await fs.promises.mkdir(cachePath, { recursive: true });

  let data;

  let exists = false;
  try {
    await fs.promises.access(filename);
    exists = true;
    // eslint-disable-next-line no-empty
  } catch (err) {
  }

  if (exists) {
    data = await fs.promises.readFile(filename);

    data = JSON.parse(data.toString());
  }

  if (!data) {
    const res = await fetch(path);

    data = await res.json();

    await fs.promises.writeFile(filename, JSON.stringify(data, null, 2));
  }

  return data;
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function unTitleCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.substr(1);
}

function getApiName(api: IApi): string {
  return api.resourcePath.split('/').filter(s => s && s !== api.apiVersion && s[0] !== '{').map(toTitleCase).join('');
}

function getTsInterfaceName(modelId: ModelID): string {
  return modelId ? `I${modelId}` : 'unknown';
}

function mapType(type?: string): string {
  switch (type) {
    case 'integer':
      return 'number';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    default:
      return type || 'unknown';
  }
}

function getTsPropertyType(property: IModelProperty): string {
  if (property.type === 'array' && property.items) {
    return getTsPropertyType(property.items) + '[]';
  }

  if (property.$ref) {
    return getTsInterfaceName(property.$ref);
  }

  return mapType(property.type);
}

function getTsParameterType(property: IParameter): string {
  if (property.enum) {
    return property.enum.map(s => `'${s}'`).join(' | ');
  }

  if (property.paramType === 'body') {
    return getTsInterfaceName(property.type);
  }

  return mapType(property.type);
}

function getTsInterface(model: IModel, options: IGenerateApisOptions): string {
  let out = '';

  if (options.splitInterfaces) {
    const interfaces = [
      ...Object.values(model.properties),
      ...Object.values(model.properties).map(property => property.items),
    ]
      .map(prop => prop && prop.$ref)
      .filter(Boolean)
      .map(modelId => modelId && getTsInterfaceName(modelId));

    out += interfaces.map(name => `import { ${name} } from "./${name}";`).join('\n');

    if (out) {
      out += '\n\n';
    }
  }

  out += `export interface ${getTsInterfaceName(model.id)} {`;

  for (const [name, property] of Object.entries(model.properties)) {
    out += `\n`;

    if (property.description) {
      out += `  // ${property.description}`;
    }

    const type =  getTsPropertyType(property);
    const required = model.required.includes(name) ? '' : '?';

    out += `\n  ${name}${required}: ${type};`;
  }

  out += `\n}`;

  return out;
}

function getTsOperationOptionsInterfaceName(operation: IOperation): string {
  return `I${operation.nickname}Options`;
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items));
}

function getTsParam(parameter: IParameter): string {
  const required = parameter.required ? '' : '?';
  const type = getTsParameterType(parameter);

  let out = '';
  if (parameter.description) {
    out += `\n    // ${parameter.description}`;
  }
  out += `\n    ${parameter.name}${required}: ${type};`;

  return out;
}

function getTsOperationOptionsInterface(operation: IOperation, options: IGenerateApisOptions): string {
  let body = '';
  let query = '';
  let params = '';

  for (const param of operation.parameters) {
    if (param.paramType === 'body') {
      body += getTsParam(param);
    }

    if (param.paramType === 'query') {
      query += getTsParam(param);
    }

    if (param.paramType === 'path') {
      params += getTsParam(param);
    }
  }

  let out = '';

  if (options.splitInterfaces) {
    out += 'import { IOperationOptions } from "../Api";';

    const interfaces = [
      ...operation.parameters
        .filter(param => param.paramType === 'body')
        .map(param => getTsInterfaceName(param.type)),
    ];

    out += uniq(interfaces).map(name => `\nimport { ${name} } from "./${name}";`);

    if (out) {
      out += '\n\n';
    }
  }

  out += `export interface ${getTsOperationOptionsInterfaceName(operation)} extends IOperationOptions {`;

  if (body) {
    const bodyRequired = operation.parameters.filter(o => o.paramType === 'body').some(o => o.required);

    out += `\n  body${bodyRequired ? '' : '?'}: {${body}\n  };\n`;
  }

  if (query) {
    const queryRequired = operation.parameters.filter(o => o.paramType === 'query').some(o => o.required);

    out += `\n  query${queryRequired ? '' : '?'}: {${query}\n  };`;
  }

  if (params) {
    const paramsRequired = operation.parameters.filter(o => o.paramType === 'path').some(o => o.required);

    out += `\n  params${paramsRequired ? '' : '?'}: {${params}\n  };`;
  }

  out += '\n}';

  return out;
}

function getJsDocParamType(parameter: IParameter): string {
  if (parameter.paramType === 'body') {
    return 'object'
  }

  return mapType(parameter.type);
}

function getJsDocParam(parameter: IParameter): string {
  const t = `${getJsDocParamType(parameter)}`.padEnd(7);
  const n = `${parameter.required ? ' ' : '['}${parameter.name}${parameter.required ? '' : ']'}`;

  let d = parameter.description;

  if (parameter.paramType === 'body') {
    d += getTsInterfaceName(parameter.type);
  }

  if (parameter.enum) {
    d += ' (' + parameter.enum.map(s => `'${s}'`).join('|') + ')';
  }

  return `\n   * @param   ${t} ${n} - ${d}`;
}

function getJsDocOperation(operation: IOperation): string {
  let body = '';
  let query = '';
  let params = '';

  for (const param of operation.parameters) {
    if (param.paramType === 'body') {
      body += getJsDocParam({
        ...param,
        name: `options.body.${param.name}`,
      });
    }

    if (param.paramType === 'query') {
      query += getJsDocParam({
        ...param,
        name: `options.query.${param.name}`,
      });
    }

    if (param.paramType === 'path') {
      params += getJsDocParam({
        ...param,
        name: `options.params.${param.name}`,
      });
    }
  }

  let out = '';

  out += '  /**';
  out += `\n   * ${operation.summary}`;
  out += getJsDocParam({
    name: `options`,
    type: 'object',
    required: operation.parameters.some(o => o.required),
    description: getTsOperationOptionsInterfaceName(operation),
  });

  if (body) {
    out += getJsDocParam({
      name: `options.body`,
      type: 'object',
      required: operation.parameters.filter(o => o.type === 'body').some(o => o.required),
      description: 'body params',
    });

    out += body;
  }

  if (query) {
    out += getJsDocParam({
      name: `options.query`,
      type: 'object',
      required: operation.parameters.filter(o => o.type === 'query').some(o => o.required),
      description: 'query params',
    });

    out += query;
  }

  if (params) {
    out += getJsDocParam({
      name: `options.params`,
      type: 'object',
      required: operation.parameters.filter(o => o.type === 'path').some(o => o.required),
      description: 'path params',
    });

    out += params;
  }

  out += `\n   * @returns Promise <${getTsInterfaceName(operation.type)}>`;
  out += `\n   */`;

  return out;
}

function getTsOperation(operation: IOperation, url: string): string {
  let out = getJsDocOperation(operation);

  const required = operation.parameters.some(o => o.required);

  out += `\n  async ${unTitleCase(operation.nickname)}(options${required ? '' : '?'}: ${getTsOperationOptionsInterfaceName(operation)}): Promise<${getTsInterfaceName(operation.type)}> {`;
  out += `\n    return this.requestJson({ method: '${operation.method}', path: '${url}', ...options });`;
  out += `\n  }`;

  return out;
}

function getTsApi(className: string, api: IApi, options: IGenerateApisOptions): string {
  let out = `import { Api${options.splitInterfaces ? '' : ', IOperationOptions'} } from "./Api";`;

  if (options.splitInterfaces) {
    const interfaces = uniq(api.apis
      .map(o => o.operations)
      .flat()
      .map(operation => [
        getTsOperationOptionsInterfaceName(operation),
        getTsInterfaceName(operation.type),
      ]).flat());

    out += interfaces
      .filter(name => name !== 'unknown')
      .map(name => `import { ${name} } from "./interfaces/${name}";`).join('\n');
  } else {
    for (const model of Object.values(api.models)) {
      out += '\n\n' + getTsInterface(model, options);
    }

    for (const { operations } of api.apis) {
      for (const operation of operations) {
        out += '\n\n' + getTsOperationOptionsInterface(operation, options);
      }
    }
  }

  out += `\n`;

  if (api.description) {
    out += `\n// ${api.description}`;
  }

  out += `\nexport class ${className} extends Api {`;
  out += `\n  /**`;
  out += `\n   * Create instance`;
  out += `\n   * @constructor`;
  out += `\n   * @param {string} token - OAuth token`;
  out += `\n   */`;
  out += `\n  constructor(token: string) {`;
  out += `\n    super({ url: '${api.basePath}', token });`;
  out += `\n  }`;

  for (const { operations, path } of api.apis) {
    for (const operation of operations) {
      out += '\n';
      out += '\n' + getTsOperation(operation, path);
    }
  }

  out += '\n}\n';

  return out;
}

export interface IGenerateApisOptions {
  url: string;
  dest: string;
  splitInterfaces: boolean;
  groupClass: string;
}

export async function generateApis(options: IGenerateApisOptions): Promise<void> {
  await fs.promises.mkdir(options.dest, { recursive: true });

  if (options.splitInterfaces) {
    await fs.promises.mkdir(`${options.dest}/interfaces`, { recursive: true });
  }

  await fs.promises.copyFile(`${__dirname}/../template/Api.ts`, `${options.dest}/Api.ts`);

  const schemaApi = await getJson(options.url) as ISchemaApi;

  const apis: IApi[] = [];

  for (const schemaApiInfo of schemaApi.apis) {
    console.log(`Get schema for "${schemaApiInfo.description}"`);

    const api = await getJson(schemaApi.basePath + schemaApiInfo.path) as IApi;

    apis.push(api);

    if (!options.groupClass) {
      const data = getTsApi(getApiName(api), api, options);

      await fs.promises.writeFile(`${options.dest}/${getApiName(api)}.ts`, data);
    }

    if (options.splitInterfaces) {
      for (const model of Object.values(api.models)) {
        const data = getTsInterface(model, options);

        await fs.promises.writeFile(`${options.dest}/interfaces/${getTsInterfaceName(model.id)}.ts`, data);
      }

      for (const { operations } of api.apis) {
        for (const operation of operations) {
          const data = getTsOperationOptionsInterface(operation, options);

          await fs.promises.writeFile(`${options.dest}/interfaces/${getTsOperationOptionsInterfaceName(operation)}.ts`, data);
        }
      }
    }
  }

  if (options.groupClass) {
    const api = apis.reduce((acc, api) => ({
      ...acc,
      apis: [
        ...acc.apis,
        ...api.apis,
      ],
      models: {
        ...acc.models,
        ...api.models,
      },
    }));

    const data = getTsApi(options.groupClass, api, options);

    await fs.promises.writeFile(`${options.dest}/${options.groupClass}.ts`, data);
  }
}
