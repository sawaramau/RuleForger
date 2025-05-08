"use strict"

const {Parser} = require("./main.js")


const str = 
`
entrypoint = $expr
expr($c,$a) = $term:term
expr.add = {$v3:term(\`11\`), $v4:term(\`11\`),} $v1:expr white '+' white $v2:term
expr.minus = $v1:expr white '-' white $v2:term
// expr.add = {$v3:term(\`11\`), $v4:term(\`11\`),} $v1:term white '+' white $v2:expr
// expr.minus = {$v3:term(\`11\`), $v4:term(\`11\`),} white $v1:term white !'+' '-' white $v2:expr
term = $num:(nonZero digits*) | $num:'0' | ('aaaaaaaa' | ('bbbbbbb')) 
digits = '0123456789'
nonZero = '123456789'
e = ''
white = e | ' '* 
`;
const parser = new Parser;
const evals = [
    {
        nameHierarchy: "entrypoint",
        action: $ => {
            return $.expr.value;
        }
    },
    {
        nameHierarchy: "entrypoint2",
        action: $ => {
            return $.expr.value;
        }
    },
    {
        nameHierarchy: "expr",
        action: $ => {
            return $.term.value;
        }
    },
    {
        nameHierarchy: "expr.add",
        action: $ => {
            return $.v1.value + $.v2.value;
        }
    },
    {
        nameHierarchy: "expr.minus",
        action: $ => {
            console.log($.v1.str, $.v2.str);
            return $.v1.value - $.v2.value;
        }
    },
    {
        nameHierarchy: ["term"],
        action: $ => {
            return Number($.num.str);
        }
    },
];
parser.bnf = str;
parser.evaluators = evals;
parser.entryPoint = 'entrypoint';
parser.program = "1 - 2 - 3 - 5";
console.log('-------------');
console.log(parser.bnfStr);
console.log('-------------');

//console.log(parser.bnfStr);
console.log(parser.execute());
