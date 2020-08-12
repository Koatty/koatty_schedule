/**
 * get metadata value of a metadata key on the prototype chain of an object and property
 * @param metadataKey metadata's key
 * @param target the target of metadataKey
 */
export declare function recursiveGetMetadata(metadataKey: any, target: any, propertyKey?: string | symbol): any[];
