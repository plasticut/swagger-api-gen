import fetch from "node-fetch";
import * as fs from 'fs';
import { ISchemaApi, IApi, IModel, IModelProperty, ModelID, IOperation } from "./swagger.interfaces";

async function getJson(path: string): Promise<unknown> {
  const cachePath = `./cache`;
  const filename = `${cachePath}/${path.replace(/[:/.\-?={}]+/g, '')}`;

  await fs.promises.mkdir(cachePath, { recursive: true });

  let data;

  try {
    await fs.promises.access(filename);

    data = await fs.promises.readFile(filename);

    data = JSON.parse(data.toString());
  } catch (err) {
    console.log(err);
  }

  if (!data) {
    console.log('Request', path);

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

function getTsType(property: IModelProperty): string {
  if (property.type === 'array' && property.items) {
    return getTsType(property.items) + '[]';
  }

  if (property.$ref) {
    return getTsInterfaceName(property.$ref);
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
      out += `  // ${property.description}\n`;
    }

    const type = getTsType(property);
    const required = model.required.includes(name) ? '' : '?';

    out += `  ${name}${required}: ${type};\n`;
  }

  out += `}\n`;

  return out;
}

function getTsOperationOptionsInterfaceName(operation: IOperation): string {
  return `I${operation.nickname}Options`;
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items));
}

function getTsOperationOptionsInterface(operation: IOperation, options: IGenerateApisOptions): string {
  let body = '';
  let query = '';
  let path = '';

  let bodyRequired = false;
  let queryRequired = false;

  for (const param of operation.parameters) {
    if (param.paramType === 'body') {
      body += `\n`;

      if (param.description) {
        body += `    // ${param.description}\n`;
      }

      const required = param.required ? '' : '?';
      const type = getTsInterfaceName(param.type);

      body += `    ${param.name}${required}: ${type};\n`;

      if (param.required) {
        bodyRequired = true;
      }
    }

    if (param.paramType === 'query') {
      query += `\n`;

      if (param.description) {
        query += `    // ${param.description}\n`;
      }

      const required = param.required ? '' : '?';

      let type;

      if (param.enum) {
        type = param.enum.map(s => `'${s}'`).join(' | ');
      } else {
        type = mapType(param.type);
      }

      query += `    ${param.name}${required}: ${type};\n`;

      if (param.required) {
        queryRequired = true;
      }
    }

    if (param.paramType === 'path') {
      path += `\n`;

      if (param.description) {
        path += `    // ${param.description}\n`;
      }

      let type;

      if (param.enum) {
        type = param.enum.map(s => `'${s}'`).join(' | ');
      } else {
        type = mapType(param.type);
      }

      path += `    ${param.name}: ${type};\n`;
    }
  }

  let out = '';

  if (options.splitInterfaces) {
    out += 'import { IOperationOptions } from "../Api";\n';

    const interfaces = [
      ...operation.parameters
        .filter(param => param.paramType === 'body')
        .map(param => getTsInterfaceName(param.type)),
    ];

    out += uniq(interfaces).map(name => `import { ${name} } from "./${name}";\n`);

    if (out) {
      out += '\n';
    }
  }

  out += `export interface ${getTsOperationOptionsInterfaceName(operation)} extends IOperationOptions {`;

  if (body) {
    out += `\n  body${bodyRequired ? '' : '?'}: {`;
    out += body;
    out += `  };\n`;
  }

  if (query) {
    out += `\n  query${queryRequired ? '' : '?'}: {`;
    out += query;
    out += `  };\n`;
  }

  if (path) {
    out += `\n  params: {`;
    out += path;
    out += `  };\n`;
  }

  out += '}\n';

  return out;
}

function getTsOperation(operation: IOperation, url: string): string {
  let out = '';

  if (operation.summary) {
    out += `  // ${operation.summary}\n`;
  }
  out += `  async ${unTitleCase(operation.nickname)}(options: ${getTsOperationOptionsInterfaceName(operation)}): Promise<${getTsInterfaceName(operation.type)}> {\n`;
  out += `    return this.requestJson({ method: '${operation.method}', path: '${url}', ...options });\n`;
  out += `  }\n`;

  return out;
}

function getTsApi(className: string, api: IApi, options: IGenerateApisOptions): string {
  let out = `import { Api${options.splitInterfaces ? '' : ', IOperationOptions'} } from "./Api";\n`;

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
      out += '\n' + getTsInterface(model, options);
    }

    for (const { operations } of api.apis) {
      for (const operation of operations) {
        out += '\n' + getTsOperationOptionsInterface(operation, options);
      }
    }
  }

  out += `\n`;

  if (api.description) {
    out += `\n// ${api.description}`;
  }

  out += `\nexport class ${className} extends Api {`;
  out += `\n  constructor(token: string) {`;
  out += `\n    super({ url: '${api.basePath}', token });`;
  out += `\n  }\n`;

  for (const { operations, path } of api.apis) {
    for (const operation of operations) {
      out += '\n';
      out += getTsOperation(operation, path);
    }
  }

  out += '}\n';

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
