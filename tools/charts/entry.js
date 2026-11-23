// Only what the two project charts use: line series, a grid, axes, tooltips, mark points, free
// graphics (the kill rug) and an accessible description, drawn as SVG. The full ECharts build is about 1 MB; this is a fraction of it.
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkPointComponent, GraphicComponent, AriaComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkPointComponent, GraphicComponent, AriaComponent, SVGRenderer]);

export const { init } = echarts;
