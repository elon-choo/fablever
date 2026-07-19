const OPERATOR_CHARS = '+-*/%^()';

class ExprError extends Error {
  constructor(message, offset) {
    super(message);
    this.name = 'ExprError';
    this.offset = offset;
  }
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isSpace(ch) {
  return /\s/.test(ch);
}

class Parser {
  constructor(src) {
    this.src = src;
    this.pos = 0;
    this.pending = null;
  }

  // Lazily produce the next token so that a parse error is reported at the earliest offset the
  // parse actually reaches, rather than at some later unlexable character.
  lex() {
    const { src } = this;
    let i = this.pos;
    while (i < src.length && isSpace(src[i])) i++;
    if (i >= src.length) {
      this.pos = src.length;
      return { type: 'end', offset: src.length };
    }
    const ch = src[i];
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1]))) {
      const start = i;
      while (i < src.length && isDigit(src[i])) i++;
      if (src[i] === '.') {
        i++;
        while (i < src.length && isDigit(src[i])) i++;
      }
      this.pos = i;
      return { type: 'num', value: Number(src.slice(start, i)), offset: start };
    }
    if (OPERATOR_CHARS.includes(ch)) {
      this.pos = i + 1;
      return { type: ch, offset: i };
    }
    throw new ExprError('unexpected character', i);
  }

  peek() {
    if (this.pending === null) this.pending = this.lex();
    return this.pending;
  }

  next() {
    const token = this.peek();
    this.pending = null;
    return token;
  }

  // expression := term (('+' | '-') term)*
  parseExpression() {
    let node = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token.type !== '+' && token.type !== '-') return node;
      this.next();
      node = { op: token.type, offset: token.offset, left: node, right: this.parseTerm() };
    }
  }

  // term := unary (('*' | '/' | '%') unary)*
  parseTerm() {
    let node = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.type !== '*' && token.type !== '/' && token.type !== '%') return node;
      this.next();
      node = { op: token.type, offset: token.offset, left: node, right: this.parseUnary() };
    }
  }

  // unary := ('+' | '-') unary | power
  parseUnary() {
    const token = this.peek();
    if (token.type === '+' || token.type === '-') {
      this.next();
      return { op: `u${token.type}`, offset: token.offset, operand: this.parseUnary() };
    }
    return this.parsePower();
  }

  // power := primary ('^' unary)?
  // Recursing into unary (not power) on the right gives both right-associativity and a signed
  // exponent, and keeping the left operand a primary keeps ^ tighter than a leading unary minus.
  parsePower() {
    const base = this.parsePrimary();
    const token = this.peek();
    if (token.type !== '^') return base;
    this.next();
    return { op: '^', offset: token.offset, left: base, right: this.parseUnary() };
  }

  // primary := number | '(' expression ')'
  parsePrimary() {
    const token = this.peek();
    if (token.type === 'num') {
      this.next();
      return { op: 'num', value: token.value, offset: token.offset };
    }
    if (token.type === '(') {
      this.next();
      const inner = this.parseExpression();
      const closing = this.peek();
      if (closing.type !== ')') throw new ExprError('expected )', this.src.length);
      return inner;
    }
    if (token.type === 'end') throw new ExprError('unexpected end of input', this.src.length);
    throw new ExprError('unexpected character', token.offset);
  }
}

function evaluate(node) {
  switch (node.op) {
    case 'num':
      return node.value;
    case 'u-':
      return -evaluate(node.operand);
    case 'u+':
      return +evaluate(node.operand);
    default:
      break;
  }

  // Left operand first, then the right one: the first division by zero in that order is the one
  // reported.
  const left = evaluate(node.left);
  const right = evaluate(node.right);
  switch (node.op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) throw new ExprError('division by zero', node.offset);
      return left / right;
    case '%':
      if (right === 0) throw new ExprError('division by zero', node.offset);
      return left % right;
    case '^':
      return left ** right;
    default:
      throw new Error(`unreachable node: ${node.op}`);
  }
}

export function evalExpr(src) {
  try {
    const parser = new Parser(src);
    // Parse the whole input before evaluating any of it, so a syntax error anywhere outranks a
    // division by zero.
    const ast = parser.parseExpression();
    const trailing = parser.peek();
    if (trailing.type !== 'end') throw new ExprError('unexpected character', trailing.offset);
    return { value: evaluate(ast) };
  } catch (error) {
    if (error instanceof ExprError) {
      return { error: { message: error.message, offset: error.offset } };
    }
    throw error;
  }
}
