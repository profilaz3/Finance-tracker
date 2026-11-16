import { createPaneSlot } from '../../utils/paneSlot';

/**
 * The right-hand column of Shared and People on wide windows. App renders the open person's page
 * into it (PersonDetail with `variant="pane"`) instead of the panel over the screen.
 */
export const personPane = createPaneSlot();
