export type Mime = string;
export type Method = string;
export type ModelID = string;
export type ParamType = 'query' | 'path' | 'body';
export type ModelPropertyType = 'string' | 'array' | 'number' | 'integer';

export interface IModelProperty {
  type?: ModelPropertyType;
  description?: string;
  items?: IModelProperty;
  format?: string;
  $ref?: ModelID;
}

export interface IModel {
  id: ModelID;
  required: string[];
  properties: {
    [propertyName: string]: IModelProperty;
  };
}

export interface IParameter {
  description: string;
  enum?: string[];
  format?: string;
  name: string;
  paramType?: ParamType;
  required: boolean;
  type: string;
}

export interface IResponseMessage {
  code: number;
  message: string;
  responseModel: ModelID;
}

export interface IOperation {
  consumes: Mime[];
  format?: string;
  method: Method;
  nickname: string;
  notes: string;
  parameters: IParameter[];
  produces: Mime[];
  responseMessages: IResponseMessage[];
  summary: string;
  type: ModelID;
}

export interface IApiOperations {
  operations: IOperation[];
  path: string;
}

export interface IApi {
  apiVersion: string;
  apis: IApiOperations[];
  basePath: string;
  swaggerVersion: string;

  consumes: Mime[];
  description: string;
  models: {
    [modelId: string]: IModel;
  };
  produces: Mime[];
  resourcePath: string;
}

export interface ISchemaApiInfo {
  description: string;
  path: string;
}

export interface ISchemaApi {
  apiVersion: string;
  apis: ISchemaApiInfo[];
  basePath: string;
  swaggerVersion: string;
}
