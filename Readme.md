# RuleForger

* RuleForgerは構文定義と意味定義の紐付けを人間にとって理解しやすい形で表現できることを目指したパーサジェネレータです．
  * Forgerは鍛冶師的な職人ぽい雰囲気だってChatGPTくんやGrokくんが言ってたのでそんな雰囲気でいい感じにRule（構文定義と意味定義）をしっかりと結びつけてくれる，そんなパーサジェネレータを目指しています．

## 特徴的な記法

* RuleForgerの特徴はBNFベースの自作表現により，構文定義の右辺側の必要な要素に意味定義側から参照可能なanchor（別名）を与えられる点です．（ただし，似た機能はほかのパーサジェネレータでもあるようです）

```bnf
entrypoint = $ep:expr1 | $ep:expr2 | $ep:expr3;
expr1 = $v1:term '+' $v2:term
expr2 = $v1:term '-' $v2:term
expr3 = $v1:term '*' $v2:term
```

* 上記のような構文定義に対し，意味定義側は以下の記載のみで済みます．（実際はもうすこし簡略化できます）

```javascript
const evals = [
    {
        ruleName: "entrypoint",
        action: $ => $.ep.value;
    },
    {
        ruleName: "expr1",
        action: $ => $.v1.value + $.v2.value;
    },
    {
        ruleName: "expr2",
        action: $ => $.v1.value - $.v2.value;
    },
    {
        ruleName: "expr3",
        action: $ => $.v1.value * $.v2.value;
    },
    // termの定義は省略
];
const ruleForger = new RuleForger;
ruleForger.bnf = bnfString;
ruleForger.evaluators = evals; // evalsは上記のような配列形式だと代入時に内部でMap形式に置き換えられる．
const parsed = ruleForger.parse(program, "entrypoint");
```

* もうひとつのそして最大の特徴はドット記法によるOR表現があります．
* 先程の構文側の定義は以下のように記述できます．

```bnf
entrypoint = $ep:expr
expr.add = $v1:term '+' $v2:term
expr.minus = $v1:term '-' $v2:term
expr.prod = $v1:term '*' $v2:term
```

* 意味定義側では上記変更に合わせてruleNameの部分だけ変更します．

```javascript
const evals = new Map;
evals.set("entrypoint", $ => $.ep.value);
evals.set("expr.add", $ => $.v1.value + $.v2.value);
evals.set("expr.minus", $ => $.v1.value - $.v2.value);
evals.set("expr.prod", $ => $.v1.value * $.v2.value);
const ruleForger = new RuleForger;
ruleForger.bnf = bnfString;
ruleForger.evaluators = evals; // map形式だとそのまま使用される
const parsed = ruleForger.parse(program, "entrypoint");
```

* 記述量は状況によっては増える可能性もありますが，多くの場合に記述量は減り，さらに構文定義側と意味定義側の双方で文脈情報（特に同一階層の情報）が見えやすくなります．

* また必要となる状況は限られますが，構文定義時点でanchorに値を与えることも可能です．
  * 良い例を思いついていないのですが，たとえばfor文とwhile文は初期化処理と停止条件に目を瞑れば全く同じ構造をしていますが，意味定義側でわざわざ初期化条件が存在するか？ 停止条件が存在するか？ を確認するのはフローとして見通しが悪くなります．そこで，以下のように構文定義を行います．

```bnf
loop = "for" "(" $init:init ";" $cond:$cond ";" $iterate:iterate ")" $state:state | {$init:nop(``), $cond:nop(``)} "while" "(" $iterate:iterate ")" $state:state
```

* これにより，for文とwhile文をたった1つの自然な意味定義で終わらせることができます．
  * 今回の例だとそもそもデフォルト値が文字列を消費しないので，適当に\$init:whiteとかでも成立するのですが・・まあそれはご愛嬌ということで．

```javascript
evals.set("loop", $ => {
    for($.init.value; $.cond.value; $.iterate.value) {
        $.state.value;
    }
});
```

* その他にも一般的な繰り返し構文（*や+），オプション表現（?）を標準で備え，終端文字は文字列（"string"）と文字集合（'charset'）のどちらも受け付け可能です．
* また，構文解析に馴染みのある人であれば苦戦した人も多いかと思われる左再帰についても，特に意識することなく定義可能です．
* 構文定義側でのanchorの省略や，特定条件での意味定義の省略などの略記についても正確性と利便性の両立が可能な範囲で記述を減らす工夫をしています．
* 具体的な記法はsamplerun.jsで確認してください．

## 拡張性

* RuleForgerはコアとなる構文解析に関する記載ルールの追加・変更が容易となるようmain.jsを設計して（いるつもりで）います．
* 例えば繰り返し構文に関してはMyRepeaterクラスというエンドユーザー向けの繰り返し構文記法を追加するためのスーパークラスを用意しています．
  * MyRepeaterのサブクラスであるMyRepeaterSampleなどを参考にしていただければ，繰り返し処理のバリエーションを作るのは簡単だと思います．
* またOR要素は全体を通して最長選択となるように実装していますが，最初のヒットにマッチするように変更したい場合，main.js内をselectLogicで検索してもらえば変更が必要な箇所はわかるかと思います．

## Author

k.izu ([sawaramau](https://github.com/sawaramau))

## Contributing

We welcome contributions under the [ISC License](LICENSE). By submitting a pull request, you agree to grant maintainers the right to relicense your code in the future. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

RuleForger is licensed under the [ISC License](LICENSE).
