import {
  EdgeStyleBase,
  GeneralPath,
  GraphComponent,
  ICanvasContext,
  IEdge,
  IInputModeContext,
  IRenderContext,
  Point,
  Rect,
  SvgVisual,
  Visual,
} from 'yfiles'

/**
 * An edge style that visualizes the flow of each edge with a specified thickness and gradient.
 */
export class SankeyEdgeStyle extends EdgeStyleBase {
  private readonly highlight: boolean

  /**
   * Creates a new instance of DemoEdgeStyle.
   * @param highlight Specifies whether this instance is used for the highlight state.
   */
  constructor(highlight: boolean = false) {
    super()
    this.highlight = highlight
  }

  /**
   * Creates the visual for an edge.
   * @param context The render context.
   * @param edge The edge to which this style instance is assigned.
   * @see Overrides {@link EdgeStyleBase#createVisual}
   * @returns {Visual} The new visual
   */
  createVisual(context: IRenderContext, edge: IEdge) {
    // This implementation creates a CanvasContainer and uses it for the rendering of the edge.
    const g = window.document.createElementNS('http://www.w3.org/2000/svg', 'g')

    const selection =
      context.canvasComponent !== null ? (<GraphComponent>context.canvasComponent).selection : null
    const selected = selection !== null && selection.isSelected(edge)
    // Get the necessary data for rendering of the edge
    const cache = this.createRenderDataCache(edge, selected)
    // Render the edge
    this.render(g, cache)
    return new SvgVisual(g)
  }

  /**
   * Re-renders the edge using the old visual for performance reasons.
   * @param context The render context.
   * @param oldVisual The old visual.
   * @param edge The edge to which this style instance is assigned.
   * @return {Visual} The updated visual.
   * @see Overrides {@link EdgeStyleBase#updateVisual}
   */
  updateVisual(context: IRenderContext, oldVisual: Visual, edge: IEdge) {
    const container = (<SvgVisual>oldVisual).svgElement
    // get the data with which the old visual was created
    const oldCache = container['data-renderDataCache']

    const selection =
      context.canvasComponent !== null ? (<GraphComponent>context.canvasComponent).selection : null
    const selected = selection !== null && selection.isSelected(edge)

    // get the data for the new visual
    const newCache = this.createRenderDataCache(edge, selected)

    // check if something changed
    if (newCache.equals(newCache, oldCache)) {
      // nothing changed, return the old visual
      return oldVisual
    }
    // something changed - re-render the visual
    while (container.hasChildNodes()) {
      // remove all children
      container.removeChild(container.firstChild)
    }
    this.render(container, newCache)
    return oldVisual
  }

  /**
   * Creates an object containing all necessary data to create an edge visual.
   */
  createRenderDataCache(edge: IEdge, selected: boolean) {
    const sourceColor = edge.sourceNode.tag.color
    const targetColor = edge.targetNode.tag.color
    return {
      thickness: edge.tag.thickness,
      selected,
      color: [sourceColor, targetColor],
      path: this.getPath(edge),
      equals: (self, other) =>
        self.thickness === other.thickness &&
        self.color === other.color &&
        self.path.hasSameValue(other.path) &&
        self.selected === other.selected,
    }
  }

  /**
   * Creates the visual appearance of an edge.
   * @param container The svg container.
   * @param cache The render data cache.
   */
  render(container: Element, cache: any) {
    // store information with the visual on how we created it
    container['data-renderDataCache'] = cache
    // Create Defs section in container

    const path = cache.path.createSvgPath()
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke-linejoin', 'round')
    // const color = `rgb(${cache.color.r},${cache.color.g},${cache.color.b})`;
    if (cache.color[0] && cache.color[1]) {
      const gradientId = SankeyEdgeStyle.randomId()
      this.createGradient(
        gradientId,
        container,
        cache.path.getBounds(),
        `rgb(${cache.color[0][0]},${cache.color[0][1]},${cache.color[0][2]})`,
        `rgb(${cache.color[1][0]},${cache.color[1][1]},${cache.color[1][2]})`
      )
      path.setAttribute('stroke', `url(#${gradientId})`)
    }

    if (this.highlight) {
      path.setAttribute('stroke', 'white')
      path.setAttribute('stroke-width', Math.max(cache.thickness, 4).toString())
      path.setAttribute('opacity', '0.3')
    } else {
      path.setAttribute('stroke-width', cache.thickness.toString())
    }
    container.appendChild(path)
  }

  createGradient(
    gradientId: string,
    container: Element,
    bounds: Rect,
    startColor: string,
    endColor: string
  ) {
    const svgNamespaceURI = 'http://www.w3.org/2000/svg'
    const defs = window.document.createElementNS(svgNamespaceURI, 'defs')
    container.appendChild(defs)

    const gradient = window.document.createElementNS(svgNamespaceURI, 'linearGradient')
    gradient.setAttribute('x1', String(bounds.x))
    gradient.setAttribute('y1', String(bounds.y))
    gradient.setAttribute('x2', String(bounds.x + bounds.width))
    gradient.setAttribute('y2', String(bounds.y))
    gradient.setAttribute('spreadMethod', 'pad')
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse')
    gradient.id = gradientId

    const stop1 = window.document.createElementNS(svgNamespaceURI, 'stop')
    stop1.setAttribute('stop-color', startColor)
    stop1.setAttribute('stop-opacity', '1.0')
    stop1.setAttribute('offset', '0')

    const stop2 = window.document.createElementNS(svgNamespaceURI, 'stop')
    stop2.setAttribute('stop-color', endColor)
    stop2.setAttribute('offset', '1.0')

    gradient.appendChild(stop1)
    gradient.appendChild(stop2)
    defs.appendChild(gradient)
  }

  /**
   * Creates a {@link GeneralPath} from the edge's bends.
   * @param {IEdge} edge The edge to create the path for
   * @return {GeneralPath} A {@link GeneralPath} following the edge
   * @see Overrides {@link EdgeStyleBase#getPath}
   */
  getPath(edge) {
    // Create a general path from the locations of the ports and the bends of the edge.
    const path = new GeneralPath()
    const overShoot = new Point(2, 0)
    path.moveTo(edge.sourcePort.location.subtract(overShoot))
    edge.bends.forEach((bend) => {
      path.lineTo(bend.location)
    })
    path.lineTo(edge.targetPort.location.add(overShoot))
    return path
  }

  /**
   * Determines whether the visual representation of the edge has been hit at the given location.
   * @param {IInputModeContext} canvasContext The render context
   * @param {Point} p The coordinates of the query in the world coordinate system
   * @param {IEdge} edge The given edge
   * @see Overrides {@link EdgeStyleBase#isHit}
   * @return {boolean} True if the edge has been hit, false otherwise
   */
  isHit(canvasContext, p, edge) {
    let thickness = 0
    const sourcePortX = edge.sourcePort.location.x
    const targetPortX = edge.targetPort.location.x

    const sourcePortLeft = sourcePortX < targetPortX
    if (edge.tag && edge.tag.thickness) {
      if (
        (sourcePortLeft && p.x >= sourcePortX && p.x <= targetPortX) ||
        (!sourcePortLeft && p.x <= sourcePortX && p.x >= targetPortX)
      ) {
        thickness = edge.tag.thickness * 0.5
      }
    }
    return this.getPath(edge).pathContains(p, canvasContext.hitTestRadius + thickness)
  }

  /**
   * Get the bounding box of the edge.
   * @see Overrides {@link EdgeStyleBase#getBounds}
   * @param {ICanvasContext} canvasContext
   * @param {IEdge} edge
   * @return {Rect}
   */
  getBounds(canvasContext, edge) {
    let thickness = 0
    if (edge.tag && edge.tag.thickness) {
      thickness = edge.tag.thickness * 0.5
    }
    return this.getPath(edge).getBounds().getEnlarged(thickness)
  }

  static randomId(length = 10) {
    if (length === undefined) {
      length = 10
    }
    if (length < 1) {
      throw new Error('Cannot generate a randomId with length less than one.')
    }
    // old version return Math.floor((1 + Math.random()) * 0x1000000).toString(16).substring(1);
    let result = ''
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for (let i = length; i > 0; --i) {
      result += chars.charAt(Math.round(Math.random() * (chars.length - 1)))
    }
    return result
  }
}
