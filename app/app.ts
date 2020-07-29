import 'bootstrap'
import '@fortawesome/fontawesome-free/js/fontawesome'
import '@fortawesome/fontawesome-free/js/solid'
import {
  Class,
  GraphComponent,
  GraphItemTypes,
  GraphViewerInputMode,
  LayoutExecutor,
  License
} from 'yfiles'
import './styles/style.css'
import { DataManager } from './DataManager'
import { Styling } from './Styling'
import licenseData from './yfiles/license.json'

// We need to load the yfiles/view-layout-bridge module explicitly to prevent the webpack
// tree shaker from removing this dependency which is needed for 'morphLayout' in this app.
Class.ensure(LayoutExecutor)

/**
 * A simple yFiles application that creates a GraphComponent and enables basic input gestures.
 */
class MarketingApp {
  private graphComponent: GraphComponent
  private inLayout: boolean
  private dataManager: DataManager

  constructor() {
    License.value = licenseData
  }

  initialize() {
    // create a GraphComponent
    this.graphComponent = new GraphComponent('#graphComponent')

    this.initializeInteraction()
    Styling.initializeStyling(this.graphComponent.graph)
    Styling.initializeHovering(this.graphComponent)

    $('body').removeClass('loading')

    this.dataManager = new DataManager(this.graphComponent)

    this.createJourney(false)

    this.registerCommands()
  }

  /**
   * Creates and initializes the input mode for this app.
   */
  initializeInteraction() {
    // initialize input mode
    const inputMode = new GraphViewerInputMode()
    inputMode.selectableItems = GraphItemTypes.NONE
    inputMode.focusableItems = GraphItemTypes.NONE
    this.graphComponent.inputMode = inputMode
  }

  /**
   * Disables the HTML elements of the UI and the input mode.
   *
   * @param disabled true if the elements should be disabled, false otherwise.
   */
  setUIDisabled(disabled) {
    ;(document.getElementById('ranger') as HTMLInputElement).disabled = disabled
  }

  /**
   * Wires up the UI.
   */
  registerCommands() {
    const ranger = $('#ranger')
    ranger.change(() => {
      this.createJourney(true, ranger.val() as number)
    })

    const layoutButton = $('#layoutButton')
    layoutButton.on('click', () => this.runLayout())
  }

  async createJourney(incremental = false, threshold = 16000) {
    if (this.inLayout) {
      return
    }
    this.inLayout = true
    this.setUIDisabled(true)

    try {
      await this.dataManager.createJourney(incremental, threshold)
    } finally {
      this.setUIDisabled(false)
      this.inLayout = false
    }
  }

  async runLayout() {
    if (this.inLayout) {
      return
    }
    this.inLayout = true
    this.setUIDisabled(true)

    try {
      await this.dataManager.runLayout()
    } finally {
      this.setUIDisabled(false)
      this.inLayout = false
    }
  }
}

const app = new MarketingApp()
app.initialize()
