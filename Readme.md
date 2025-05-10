# RuleForger

[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

> [!IMPORTANT]
> This README was automatically generated using a Japanese version as the base, with adjustments made via generative AI. For the most accurate nuance and intent, please refer to the original Japanese version.

**RuleForger** is a parser generator designed to make linking syntax and semantics more readable and intuitive.

The name comes from the image of a "forger" — a craftsman hammering rules into shape. It’s about crafting clean and solid connections between your grammar and what it means. That’s the spirit we’re going for.

## What Makes It Different?

RuleForger focuses on a BNF-like syntax that’s easy to write and easy to follow, with a few unique tricks to keep things tidy.

### Anchors

You can give elements in your grammar an alias (called an "anchor") so they’re easier to refer to in the semantic action.

```bnf
entrypoint = $ep:expr1 | $ep:expr2 | $ep:expr3;
expr1 = $v1:term '+' $v2:term;
expr2 = $v1:term '-' $v2:term;
expr3 = $v1:term '*' $v2:term;
```

Then, in your evaluator:

```javascript
const evals = [
    { ruleName: "entrypoint", action: $ => $.ep.value },
    { ruleName: "expr1", action: $ => $.v1.value + $.v2.value },
    { ruleName: "expr2", action: $ => $.v1.value - $.v2.value },
    { ruleName: "expr3", action: $ => $.v1.value * $.v2.value }
    // 'term' rule not shown
];
const ruleForger = new RuleForger();
ruleForger.bnf = bnfString;
ruleForger.evaluators = evals; // Will be converted to a Map internally
const parsed = ruleForger.parse(program, "entrypoint");
```

### Dot Notation for OR Rules

You can express OR branches using dot notation. This helps reduce repetition and gives more context in rule names.

```bnf
entrypoint = $ep:expr;
expr.add = $v1:term '+' $v2:term;
expr.minus = $v1:term '-' $v2:term;
expr.prod = $v1:term '*' $v2:term;
```

In the semantic rules:

```javascript
const evals = new Map([
    ["entrypoint", $ => $.ep.value],
    ["expr.add", $ => $.v1.value + $.v2.value],
    ["expr.minus", $ => $.v1.value - $.v2.value],
    ["expr.prod", $ => $.v1.value * $.v2.value]
]);
const ruleForger = new RuleForger();
ruleForger.bnf = bnfString;
ruleForger.evaluators = evals; // Map is used directly
const parsed = ruleForger.parse(program, "entrypoint");
```

> [!NOTE]
> Sometimes this might look a bit more verbose, but it often helps clarify the structure of your grammar and actions.

### Default Anchor Values

In certain cases, you can assign default values to anchors right in the grammar. This is useful for unifying similar-looking constructs like for and while.

```bnf
loop = "for" "(" $init:init ";" $cond:$cond ";" $iterate:iterate ")" $state:state
     | {$init:nop(``), $cond:nop(``)} "while" "(" $iterate:iterate ")" $state:state;
```

> [!NOTE]
> nop(``) just stands in for "do nothing" here — feel free to swap it out with whatever makes sense for your setup.

### Other Stuff

* Repetition (*, +), optional (?) supported out of the box.

* Terminals can be "quoted strings" or 'character sets'.

* Left recursion is supported without any hacks.

* You can skip anchors or even semantic actions when it’s safe to do so — RuleForger tries to be smart about minimizing clutter.

Check out [samplerun.js](samplerun.js) for real examples.

## Extending RuleForger

Want to add your own rule styles or tweak how parsing works? You can:

* Add new repetition types using a subclass of MyRepeater. See [main.js](main.js) for an example.

* Change how OR rules are selected (e.g., from longest-match to first-match) by editing selectLogic in [main.js](main.js).

## Author

k.izu ([sawaramau](https://github.com/sawaramau))

## Contributing

We welcome contributions under the [ISC License](LICENSE). By submitting a pull request, you agree to grant maintainers the right to relicense your code in the future. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

RuleForger is licensed under the [ISC License](LICENSE).
