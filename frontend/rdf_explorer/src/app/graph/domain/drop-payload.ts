export type DropPayload =
  | { kind: 'uri';      uri: string;                                        }
  | { kind: 'uri+prop'; uri: string; prop: string;                           }
  | { kind: 'prop';     prop: string;                                        }
  | { kind: 'literal';  prop: string;                                        }
  | { kind: 'search';   uri: string; alias: string;                          }
  | { kind: 'example';  exampleType: 'cats' | 'w3c' | 'mosquito' | 'cancer'; };
