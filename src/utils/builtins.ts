// You can generate this list by running `builtin --names` in a fish session
// note that '.', and ':' are removed from the list because they do not contain
// a man-page
export const LIST = [
  '[',
  '_',
  'and',
  'argparse',
  'begin',
  'bg',
  'bind',
  'block',
  'break',
  'breakpoint',
  'builtin',
  'case',
  'cd',
  'command',
  'commandline',
  'complete',
  'contains',
  'continue',
  'count',
  'disown',
  'echo',
  'else',
  'emit',
  'end',
  'eval',
  'exec',
  'exit',
  'false',
  'fg',
  'for',
  'function',
  'functions',
  'history',
  'if',
  'jobs',
  'math',
  'not',
  'or',
  'path',
  'printf',
  'pwd',
  'random',
  'read',
  'realpath',
  'return',
  'set',
  'set_color',
  'source',
  'status',
  'string',
  'switch',
  'test',
  'time',
  'true',
  'type',
  'ulimit',
  'wait',
  'while',
]

const SET = new Set(LIST)

export function isBuiltin(word: string): boolean {
  return SET.has(word)
}
