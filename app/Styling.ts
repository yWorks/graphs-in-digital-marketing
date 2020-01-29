import {
  Color,
  DefaultLabelStyle,
  EdgeStyleDecorationInstaller,
  Font,
  GraphComponent,
  GraphInputMode,
  GraphItemTypes,
  IEdge,
  IGraph,
  ILabel,
  INode,
  Insets,
  InteriorStretchLabelModel,
  LabelStyleDecorationInstaller,
  NodeStyleLabelStyleAdapter,
  ShapeNodeShape,
  ShapeNodeStyle,
  Size,
  SolidColorFill,
  StyleDecorationZoomPolicy,
  VoidLabelStyle
} from 'yfiles'
import { SankeyEdgeStyle } from './SankeyEdgeStyle'

const fontFamily =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",' +
  'sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"'

export class Styling {
  /**
   * Initializes the default styles for nodes, edges and labels, and the necessary listeners.
   */
  static initializeStyling(graph: IGraph) {
    // set the default style for the nodes and edges
    graph.nodeDefaults.style = new ShapeNodeStyle({
      fill: new SolidColorFill(this.getNodeColor()),
      stroke: null
    })

    // use a label model that stretches the label over the full node layout, with small insets
    const centerLabelModel = new InteriorStretchLabelModel({ insets: 3 })
    graph.nodeDefaults.labels.layoutParameter = centerLabelModel.createParameter('center')

    // set the default style for the node labels
    graph.nodeDefaults.labels.style = new DefaultLabelStyle({
      textFill: 'white',
      font: new Font({
        fontFamily,
        fontSize: 16,
        fontWeight: 'bold'
      }),
      wrapping: 'word',
      verticalTextAlignment: 'center',
      horizontalTextAlignment: 'center'
    })

    // set the default node size
    graph.nodeDefaults.size = new Size(180, 20)

    graph.nodeDefaults.shareStyleInstance = false

    graph.edgeDefaults.style = new SankeyEdgeStyle()
    graph.edgeDefaults.labels.style = new DefaultLabelStyle({
      textFill: 'white',
      font: new Font({
        fontFamily,
        fontSize: 16,
        fontWeight: 'normal'
      })
    })

    // add a node tag listener to change the node color when the tag changes
    graph.addNodeTagChangedListener((sender, args) => {
      const item = args.item
      if (item.tag && args.oldValue && item.tag.color !== args.oldValue.color) {
        ;(item.style as ShapeNodeStyle).fill = new SolidColorFill(this.getNodeColor(item))
        graph.invalidateDisplays()
      }
    })
  }

  static initializeHovering(graphComponent: GraphComponent) {
    const graphDecorator = graphComponent.graph.decorator
    graphDecorator.labelDecorator.highlightDecorator.setImplementation(
      new LabelStyleDecorationInstaller({
        labelStyle: new NodeStyleLabelStyleAdapter(
          new ShapeNodeStyle({
            shape: ShapeNodeShape.ROUND_RECTANGLE,
            stroke: '1px white',
            fill: null
          }),
          VoidLabelStyle.INSTANCE
        ),
        margins: new Insets(5, 2, 5, 2),
        zoomPolicy: StyleDecorationZoomPolicy.WORLD_COORDINATES
      })
    )
    graphDecorator.edgeDecorator.highlightDecorator.setImplementation(
      new EdgeStyleDecorationInstaller({
        edgeStyle: new SankeyEdgeStyle(true),
        zoomPolicy: StyleDecorationZoomPolicy.WORLD_COORDINATES
      })
    )

    const inputMode = graphComponent.inputMode as GraphInputMode
    inputMode.itemHoverInputMode.enabled = true
    inputMode.itemHoverInputMode.hoverItems = GraphItemTypes.EDGE | GraphItemTypes.EDGE_LABEL
    inputMode.itemHoverInputMode.discardInvalidItems = false

    // add hover listener to implement edge and label highlighting
    inputMode.itemHoverInputMode.addHoveredItemChangedListener((sender, args) => {
      const highlightManager = graphComponent.highlightIndicatorManager
      highlightManager.clearHighlights()
      const item = args.item
      if (item) {
        highlightManager.addHighlight(item)
        if (IEdge.isInstance(item)) {
          item.labels.forEach(label => {
            highlightManager.addHighlight(label)
          })
        } else if (ILabel.isInstance(item)) {
          highlightManager.addHighlight(item.owner)
        }
      }
    })
  }

  /**
   * Returns the color for the given node.
   */
  static getNodeColor(node: INode = null) {
    const color =
      node != null && typeof node.tag === 'object' && Array.isArray(node.tag.color)
        ? node.tag.color
        : [102, 153, 204]
    return new Color(color[0], color[1], color[2])
  }
}
