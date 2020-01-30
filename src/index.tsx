/** @jsx jsx */
import { run } from "@cycle/run";
import { makeDOMDriver, MainDOMSource, VNode, VNodeData } from "@cycle/dom";
import { Stream } from "xstream";
import { style, types } from "typestyle";
import snabbdom, { createElement } from "snabbdom-pragma";

// https://github.com/microsoft/TypeScript/pull/12253#issuecomment-263132208
export const unsafeKeys = Object.keys as <T>(
  o: T
) => (Extract<keyof T, string>)[];

type ValuesPerBreakpoint<T> = [
  T /* min-width < 40em */,
  T? /* 40em to 52em */,
  T? /* 52em and bigger */
];

type ResponsiveProperties = {
  [P in keyof types.CSSProperties]:
    | Exclude<types.CSSProperties[P], any[]>
    | ValuesPerBreakpoint<types.CSSProperties[P]>
};

interface NestedResponsiveProperties extends ResponsiveProperties {
  $nest: {
    [selector: string]: NestedResponsiveProperties | undefined;
  };
}

function makeResponsive(
  properties: NestedResponsiveProperties
): types.NestedCSSProperties {
  let next: types.NestedCSSProperties = { $nest: {} };

  for (const key of unsafeKeys(properties)) {
    const value = properties[key];
    if (key === "$nest") {
      Object.entries(properties.$nest).forEach(([k, v]) => {
        if (v) {
          next.$nest![k] = makeResponsive(v);
        }
      });
    } else if (Array.isArray(value)) {
      (next as Record<string, any>)[key] = value[0];
      // handle ValuesPerBreakpoint,
      for (let i = 1; i < value.length; i++) {
        const media = mediaQueries[i - 1];
        next.$nest![media] = next.$nest![media] || {};
        // ts(2590)
        // next.$nest![media]![key] = value[i];
        (next.$nest![media]! as any)[key] = value[i];
      }
    } else {
      // ts(2590)
      (next as Record<string, any>)[key] = value;
    }
  }

  return next;
}

const mediaQueries = [40, 52]
  .map(n => n + "em")
  .map(breakpoint => `@media screen and (min-width: ${breakpoint})`);

type StyleProperties = NestedResponsiveProperties | false | null | undefined;
interface VNodeDataWithCss extends VNodeData {
  css?: StyleProperties | StyleProperties[];
}
const jsx = (
  type: string | snabbdom.Component,
  props: VNodeDataWithCss,
  ...children: snabbdom.CircularChildren[]
) => {
  if (props && props.css) {
    const { css } = props;
    const styles = (Array.isArray(css) ? css : [css])
      .map(x => x && makeResponsive(x))
      .filter(Boolean);
    const className = !css ? "" : style(...styles);
    const finalProps = {
      ...props,
      attrs: {
        ...props.attrs,
        class: [props.attrs && props.attrs.class, className]
          .filter(Boolean)
          .join(" ")
      }
    };
    delete finalProps.css;
    return createElement(type, finalProps, ...children);
  }

  return createElement(type, props, ...children);
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicAttributes extends VNodeDataWithCss {}
  }
}

///

const valueToColor = (value: number) => {
  switch (value) {
    case 0:
      return "transparent";
    case 1:
      return "red";
    case 2:
      return "yellow";
    case 3:
      return "orange";
    case 4:
      return "lightgreen";
    default:
      return value > 4 ? "lightgreen" : "inherit";
  }
};

const passwordStrengthTexts = (value: number) =>
  [" ", "Weak 😱", "Average 😏", "Strong 🤗", "Very Strong 🤩"][value] ||
  "Amazing 👏";

export type Sources = {
  DOM: MainDOMSource;
};
export type Sinks = {
  DOM: Stream<VNode>;
};

function main(sources: Sources) {
  const input$ = sources.DOM.select("input").events("input");

  const password$ = input$
    .map(e => e.target && (e.target as HTMLInputElement).value)
    .startWith("");

  const vdom$ = password$.map(password => {
    const value = Math.floor((password || "").length / 3);
    return (
      <form
        css={{
          padding: "20px",
          fontFamily: "monospace",
          fontSize: [20, 30, 40],
          color: ["black", "tomato"]
        }}
      >
        <label>
          <span>Password</span>
          <input
            type="password"
            css={{
              marginLeft: 20,
              fontSize: "inherit",
              fontFamily: "inherit",
              border: "1px solid rgba(0,0,0,0.6)",
              borderRadius: 2
            }}
          />
        </label>
        <div css={{ marginTop: 20 }}>
          <span>Strength: {passwordStrengthTexts(value)}</span>
          <meter
            value={value}
            max={4}
            css={{
              marginTop: 20,

              margin: "0 auto 1em",
              width: "100%",
              height: "0.5em",

              $nest: {
                "&::-webkit-meter-optimum-value": {
                  background: valueToColor(value)
                },

                "&::-webkit-meter-bar": {
                  background: "none",
                  backgroundColor: "rgba(0, 0, 0, 0.1)"
                }
              }
            }}
          />
        </div>
      </form>
    );
  });

  return { DOM: vdom$ };
}

run(main, { DOM: makeDOMDriver("#app") });
