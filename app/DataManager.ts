import * as _ from 'lodash'

import {
  EdgesSource,
  GraphBuilder,
  GraphComponent,
  HashMap,
  IEdge,
  IGraph,
  INode,
  NodesSource,
  ShapeNodeStyle,
  SolidColorFill
} from 'yfiles'
import triples from './data/triples'
import names from './data/names'
import transitionStats from './data/transitionStats'
import { SankeyLayoutConfiguration } from './SankeyLayoutConfiguration'

export class DataManager {
  private readonly graphBuilder: GraphBuilder
  private readonly nodesSource: NodesSource<any>
  private readonly edgesSource: EdgesSource<any>

  private largestThickness: number
  private readonly smallestThickness: number
  private graphComponent: GraphComponent

  constructor(graphComponent: GraphComponent) {
    this.graphComponent = graphComponent
    this.largestThickness = 200
    this.smallestThickness = 2

    this.graphBuilder = new GraphBuilder(graphComponent.graph)
    this.nodesSource = this.graphBuilder.createNodesSource({
      data: [],
      id: 'id'
    })
    this.nodesSource.nodeCreator.createLabelBinding(nodeDataItem => nodeDataItem.label)

    this.edgesSource = this.graphBuilder.createEdgesSource({
      data: [],
      sourceId: 'source',
      targetId: 'target'
    })
    this.edgesSource.edgeCreator.createLabelBinding(edgeDataItem => edgeDataItem.label)
  }

  get graph(): IGraph {
    return this.graphComponent.graph
  }

  async createJourney(incremental = false, threshold = 16000) {
    const json = this.processTriples(threshold)

    this.graphBuilder.setData(this.nodesSource, json.nodes)
    this.graphBuilder.setData(this.edgesSource, json.edges)

    const incrementalNodes: INode[] = []
    const conversionNode = this.findConversionNode()
    const nodeCreatedListener = (sender, args) => {
      const node = args.item
      node.tag = { color: [102, 153, 204] }
      if (conversionNode) {
        // let new nodes appear at the "Conversion" node
        this.graph.setNodeLayout(node, conversionNode.layout.toRect())
      }
      incrementalNodes.push(args.item)
    }

    const oldTags = new HashMap<INode, object>()
    this.graph.nodes.forEach(node => oldTags.set(node, node.tag))
    const nodeUpdatedListener = (sender, args) => {
      args.item.tag = oldTags.get(args.item)
    }

    const incrementalEdges: IEdge[] = []
    const edgeCreatedListener = (sender, args) => incrementalEdges.push(args.item)

    this.graphBuilder.addNodeCreatedListener(nodeCreatedListener)
    this.graphBuilder.addNodeUpdatedListener(nodeUpdatedListener)
    this.graphBuilder.addEdgeCreatedListener(edgeCreatedListener)
    this.graphBuilder.updateGraph()
    this.graphBuilder.removeNodeCreatedListener(nodeCreatedListener)
    this.graphBuilder.removeNodeUpdatedListener(nodeUpdatedListener)
    this.graphBuilder.removeEdgeCreatedListener(edgeCreatedListener)

    // normalize the edges' thickness and run a new layout
    this.normalizeThickness()

    return this.runLayout(incremental, incrementalNodes, incrementalEdges)
  }

  async runLayout(
    incremental: boolean = false,
    incrementalNodes: INode[] = null,
    incrementalEdges: IEdge[] = null
  ) {
    const layout = SankeyLayoutConfiguration.createHierarchicLayout(incremental)
    const hierarchicLayoutData = SankeyLayoutConfiguration.createHierarchicLayoutData(
      incrementalNodes,
      incrementalEdges
    )

    await this.graphComponent.morphLayout(layout, '1s', hierarchicLayoutData)

    const allx = new Set()
    this.graph.nodes.forEach((n: INode) => {
      allx.add(n.layout.center.x)
    })
    // @ts-ignore
    const columnX = _.sortBy(Array.from(allx))
    const colorMargin = 0.2
    const saturation = 0.6
    const step = (1.0 - 2 * colorMargin) / columnX.length
    const heatColors = _.range(colorMargin, 1 - colorMargin, step).map(value =>
      DataManager.hslToRgb(217 / 360, saturation, value)
    )
    this.graph.nodes.forEach((n: INode) => {
      const index = columnX.indexOf(n.layout.center.x)
      const rgbTriple = heatColors[index]
      ;(n.style as ShapeNodeStyle).fill = new SolidColorFill(...rgbTriple)
      n.tag.color = heatColors[index]
    })
  }

  private findConversionNode() {
    return this.graph.nodes.find(node => node.labels.some(l => l.text === 'Conversion'))
  }

  /**
   * Normalizes the thickness of the edges of the graph based on the current label texts. The largest thickness is
   * 400, while the smallest 1. If the label text is not a number, edge thickness 1 will be assigned.
   */
  normalizeThickness() {
    let min = Number.MAX_VALUE
    let max = -Number.MAX_VALUE
    const graph = this.graphComponent.graph
    if (graph.nodes.size === 0) {
      return
    }

    // find the minimum and maximum flow value from the graph's edge labels
    this.graph.edges.forEach(edge => {
      const tag = edge.tag

      if (tag == null) {
        throw new Error("Edge is missing required 'tag' instance")
      }
      const value = Math.max(0, parseFloat(edge.tag.value))
      if (Number.isNaN(value)) {
        return
      }
      min = Math.min(min, value)
      max = Math.max(max, value)
    })

    const diff = max - min
    const largestThickness = 200
    const smallestThickness = 2

    // normalize the thickness of the graph's edges
    this.graph.edges.forEach(edge => {
      const tag = edge.tag

      if (tag == null) {
        return
      }
      const value = Math.max(0, parseFloat(edge.tag.value))

      if (isNaN(value)) {
        edge.tag.thickness = 2
      } else {
        const thicknessScale = (largestThickness - smallestThickness) / diff
        edge.tag.thickness = Math.floor(this.smallestThickness + (value - min) * thicknessScale)
      }
    })
  }

  processTriples(threshold = 10000) {
    let k
    const json = { nodes: [], edges: [] }
    const nodes: string[] = []
    for (let k = 1; k < 202; k++) {
      nodes.push(k.toString())
    }

    const edges = []
    for (let k = 1; k < triples.length; k++) {
      const item = triples[k]
      const val = parseFloat(item[2])
      if (val === null || val === 0) continue
      const ival = 1 / item[2]
      if (val >= threshold) edges.push([item[0], item[1], ival])
    }

    function kruskal(nodes: string[], edges) {
      const mst = []
      let forest = _.map(nodes, function(node) {
        return [node]
      })
      const sortedEdges = _.sortBy(edges, function(edge) {
        return -edge[2]
      })
      while (forest.length > 1) {
        const edge = sortedEdges.pop()
        if (edge === undefined) return mst
        const n1 = edge[0],
          n2 = edge[1]

        const t1 = _.filter(forest, function(tree) {
          return _.includes(tree, n1)
        })

        const t2 = _.filter(forest, function(tree) {
          return _.includes(tree, n2)
        })

        if (t1[0] != t2[0]) {
          forest = _.without(forest, t1[0], t2[0])
          forest.push(_.union(t1[0], t2[0]))
          mst.push(edge)
        }
      }
      return mst
    }

    const maxTree = kruskal(nodes, edges)

    const usedTouchpoints = []
    for (k = 0; k < maxTree.length; k++) {
      const item = maxTree[k]
      const from = item[0]

      const to = item[1]
      if (!_.includes(usedTouchpoints, from)) usedTouchpoints.push(from)
      if (!_.includes(usedTouchpoints, to)) usedTouchpoints.push(to)
      //console.log(from + ">" + to);
      const stats = DataManager.findTransitionStats(from, to) || {
        Transition: '',
        ClassifiedFrequency: 0,
        UnclassifiedFrequency: '?',
        Conversion: '?',
        ClAvgTime: '?',
        NclAvgTime: '?'
      }

      json.edges.push({
        source: from.toString(),
        target: to.toString(),
        label: parseInt(stats.ClassifiedFrequency),
        value: parseInt(stats.ClassifiedFrequency),
        ncl: parseInt(stats.UnclassifiedFrequency),
        con: parseFloat(stats.Conversion),
        cltTime: parseFloat(stats.ClAvgTime),
        nclTime: parseFloat(stats.NclAvgTime)
      })
    }
    for (k = 0; k < usedTouchpoints.length; k++) {
      const id = usedTouchpoints[k].toString()
      json.nodes.push({
        name: usedTouchpoints[k].toString(),
        label: DataManager.getURL(usedTouchpoints[k].toString()),
        id: id
      })
      const foundMerge = _.find(json.edges, e => e.source == id && e.target == 'F')
      if (_.isNil(foundMerge) && id !== 'F') {
        // conversion does not lead to conversion
        json.edges.push({
          source: id,
          target: 'F',
          label: null,
          value: null,
          ncl: null,
          con: null,
          cltTime: null,
          nclTime: null
        })
      }
    }
    return json
  }

  private static hslToRgb(h, s, l) {
    let r, g, b

    if (s == 0) {
      r = g = b = l // achromatic
    } else {
      const hue2rgb = function hue2rgb(p, q, t) {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
      }

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hue2rgb(p, q, h + 1 / 3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1 / 3)
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)] // `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})` ;
  }

  private static findTransitionStats(from, to) {
    const name = 'M' + from + '>' + 'M' + (to == 'F' ? 201 : to)
    return _.find(transitionStats, { Transition: name })
  }

  private static getURL(s) {
    if (typeof s === 'string' && s.indexOf('M') == 0) {
      s = s.substring(1)
    }
    if (s == 'F') return 'Conversion'
    const item = _.find(names, { Id: parseInt(s) })
    let replaced = '&empty;'
    if (!_.isNil(item)) {
      replaced = item.Name.replace('https://www.', '').replace('http://www.', '')
      if (replaced.lastIndexOf('/') === replaced.length - 1) {
        replaced = replaced.substring(0, replaced.length - 1)
      }
    }
    return replaced
  }
}
