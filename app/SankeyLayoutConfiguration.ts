import {
  GenericLabeling,
  HierarchicLayout,
  HierarchicLayoutData,
  IEdge,
  IEnumerable,
  ILayoutAlgorithm,
  INode,
  LabelPlacements,
  LayoutGraph,
  LayoutMode,
  LayoutOrientation,
  LayoutStageBase,
  List,
  PortConstraint,
  PortSide,
  PreferredPlacementDescriptor,
  YNode
} from 'yfiles'

/**
 * This class creates and configures the hierarchic layout algorithm for the Sankey visualization.
 */
export class SankeyLayoutConfiguration {
  /**
   * Configures the hierarchic layout algorithm for the Sankey visualization
   * @param incremental True if the layout should run from sketch, false otherwise
   * @return {HierarchicLayout} The configured hierarchic layout
   */
  static createHierarchicLayout(incremental: boolean) {
    const hierarchicLayout = new HierarchicLayout({
      layoutOrientation: LayoutOrientation.LEFT_TO_RIGHT,
      layoutMode: incremental ? LayoutMode.INCREMENTAL : LayoutMode.FROM_SCRATCH,
      nodeToNodeDistance: 30,
      backLoopRouting: true
    })
    hierarchicLayout.edgeLayoutDescriptor.minimumFirstSegmentLength = 80
    hierarchicLayout.edgeLayoutDescriptor.minimumLastSegmentLength = 80

    // a port border gap ratio of zero means that ports can be placed directly on the corners of the nodes
    const portBorderRatio = 1
    hierarchicLayout.nodeLayoutDescriptor.portBorderGapRatios = portBorderRatio
    // configures the generic labeling algorithm which produces more compact results, here
    const genericLabeling = hierarchicLayout.labeling as GenericLabeling
    genericLabeling.reduceAmbiguity = false
    genericLabeling.placeNodeLabels = false
    genericLabeling.placeEdgeLabels = true
    hierarchicLayout.labelingEnabled = true

    // for Sankey diagrams, the nodes should be adjusted to the incoming/outgoing flow (enlarged if necessary)
    // -> use NodeResizingStage for that purpose
    const nodeResizingStage = new NodeResizingStage(hierarchicLayout)
    nodeResizingStage.layoutOrientation = hierarchicLayout.layoutOrientation
    nodeResizingStage.portBorderGapRatio = portBorderRatio
    hierarchicLayout.prependStage(nodeResizingStage)

    return hierarchicLayout
  }

  /**
   * Configures the hierarchic layout data for the Sankey visualization
   * @return {HierarchicLayoutData} The configured hierarchic Layout data object
   */
  static createHierarchicLayoutData(
    incrementalNodes: INode[] = null,
    incrementalEdges: IEdge[] = null
  ) {
    // create the layout data
    let hierarchicLayoutData = new HierarchicLayoutData({
      // maps each edge with its thickness so that the layout algorithm takes the edge thickness under consideration
      edgeThickness: edge => edge.tag.thickness,
      // since orientation is LEFT_TO_RIGHT, we add port constraints so that the edges leave the source node at its
      // right side and enter the target node at its left side
      sourcePortConstraints: PortConstraint.create(PortSide.EAST, false),
      targetPortConstraints: PortConstraint.create(PortSide.WEST, false),
      edgeLabelPreferredPlacement: new PreferredPlacementDescriptor({
        placeAlongEdge: LabelPlacements.AT_SOURCE
      })
    })
    if (incrementalNodes && incrementalNodes.length > 0) {
      hierarchicLayoutData.incrementalHints.incrementalLayeringNodes.items = List.fromArray(
        incrementalNodes
      )
    }
    if (incrementalEdges && incrementalEdges.length > 0) {
      hierarchicLayoutData.incrementalHints.incrementalSequencingItems.items = List.fromArray(
        incrementalEdges
      )
    }
    return hierarchicLayoutData
  }
}

/**
 * This layout stage ensures that the size of the nodes is large enough such that
 * all edges can be placed without overlaps.
 */
class NodeResizingStage extends LayoutStageBase {
  /**
   * The main orientation of the layout. Should be the same value as for the associated core layout
   * algorithm.
   */
  layoutOrientation: LayoutOrientation
  /**
   * The port border gap ratio for the port distribution at the sides of the nodes.
   * Should be the same value as for the associated core layout algorithm.
   */
  portBorderGapRatio: number
  /**
   * Returns the minimum distance between two ports on the same node side.
   */
  minimumPortDistance: number

  /**
   * Creates a new instance of NodeResizingStage.
   * @param {ILayoutAlgorithm} coreLayout
   */
  constructor(coreLayout) {
    super(coreLayout)
    this.layoutOrientation = LayoutOrientation.LEFT_TO_RIGHT
    this.portBorderGapRatio = 0
    this.minimumPortDistance = 0
  }

  /**
   * Applies the layout to the given graph.
   * @param {LayoutGraph} graph The given graph
   */
  applyLayout(graph) {
    graph.nodes.forEach(node => {
      this.adjustNodeSize(node, graph)
    })

    // run the core layout
    this.applyLayoutCore(graph)
  }

  /**
   * Adjusts the size of the given node.
   * @param {YNode} node The given node
   * @param {LayoutGraph} graph The given graph
   */
  adjustNodeSize(node, graph) {
    let width = 180
    let height = 20

    const leftEdgeSpace = this.calcRequiredSpace(node.inEdges, graph)
    const rightEdgeSpace = this.calcRequiredSpace(node.outEdges, graph)
    if (
      this.layoutOrientation === LayoutOrientation.TOP_TO_BOTTOM ||
      this.layoutOrientation === LayoutOrientation.BOTTOM_TO_TOP
    ) {
      // we have to enlarge the width such that the in-/out-edges can be placed side by side without overlaps
      width = Math.max(width, leftEdgeSpace)
      width = Math.max(width, rightEdgeSpace)
    } else {
      // we have to enlarge the height such that the in-/out-edges can be placed side by side without overlaps
      height = Math.max(height, leftEdgeSpace)
      height = Math.max(height, rightEdgeSpace)
    }

    // adjust size for edges with strong port constraints
    const edgeThicknessDP = graph.getDataProvider(HierarchicLayout.EDGE_THICKNESS_DP_KEY)
    if (edgeThicknessDP !== null) {
      node.edges.forEach(edge => {
        const thickness = edgeThicknessDP.getNumber(edge)

        const spc = PortConstraint.getSPC(graph, edge)
        if (edge.source === node && spc !== null && spc.strong) {
          const sourcePoint = graph.getSourcePointRel(edge)
          width = Math.max(width, Math.abs(sourcePoint.x) * 2 + thickness)
          height = Math.max(height, Math.abs(sourcePoint.y) * 2 + thickness)
        }

        const tpc = PortConstraint.getTPC(graph, edge)
        if (edge.target === node && tpc !== null && tpc.strong) {
          const targetPoint = graph.getTargetPointRel(edge)
          width = Math.max(width, Math.abs(targetPoint.x) * 2 + thickness)
          height = Math.max(height, Math.abs(targetPoint.y) * 2 + thickness)
        }
      })
    }
    graph.setSize(node, width, height)
  }

  /**
   * Calculates the space required when placing the given edge side by side without overlaps and considering
   * the specified minimum port distance and edge thickness.
   * @param {IEnumerable} edges The edges to calculate the space for
   * @param {LayoutGraph} graph The given graph
   */
  calcRequiredSpace(edges, graph) {
    let requiredSpace = 0
    const edgeThicknessDP = graph.getDataProvider(HierarchicLayout.EDGE_THICKNESS_DP_KEY)
    let count = 0
    edges.forEach(edge => {
      const thickness = edgeThicknessDP === null ? 0 : edgeThicknessDP.getNumber(edge)
      requiredSpace += Math.max(thickness, 1)
      count++
    })

    requiredSpace += (count - 1) * this.minimumPortDistance
    requiredSpace += 2 * this.portBorderGapRatio * this.minimumPortDistance
    return requiredSpace
  }
}
