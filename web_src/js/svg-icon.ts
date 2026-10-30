import {h, type Component} from 'vue';
import {svgParseOuterInner} from './svg.ts';

export const SvgIcon: Component = {
  name: 'SvgIcon',
  props: {
    name: {type: String, required: true},
    size: {type: Number, default: 16},
    symbolId: {type: String},
  },
  render() {
    let {svgOuter, svgInnerHtml} = svgParseOuterInner(this.name);
    // https://vuejs.org/guide/extras/render-function.html#creating-vnodes
    // the `^` is used for attr, set SVG attributes like 'width', `aria-hidden`, `viewBox`, etc
    const attrs = {};
    for (const attr of svgOuter.attributes) {
      if (attr.name === 'class') continue;
      attrs[`^${attr.name}`] = attr.value;
    }
    attrs[`^width`] = this.size;
    attrs[`^height`] = this.size;

    const classes = Array.from(svgOuter.classList);
    if (this.symbolId) {
      classes.push('tw-hidden', 'svg-symbol-container');
      svgInnerHtml = `<symbol id="${this.symbolId}" viewBox="${attrs['^viewBox']}">${svgInnerHtml}</symbol>`;
    }
    // create VNode
    return h('svg', {
      ...attrs,
      class: classes,
      innerHTML: svgInnerHtml,
    });
  },
};
