export type AppTab = 'gestures' | 'time-arrow' | 'analogy' | 'language' | 'compositional';

export class Sidebar {
  private currentTab: AppTab = 'gestures';
  private onTabChangeCallback: ((tab: AppTab) => void) | null = null;

  constructor() {
    this.bindEvents();
  }

  public setOnTabChange(cb: (tab: AppTab) => void): void {
    this.onTabChangeCallback = cb;
  }

  public getActiveTab(): AppTab {
    return this.currentTab;
  }

  public switchTab(tab: AppTab): void {
    this.currentTab = tab;

    // Update Sidebar Navigation Buttons
    const buttons = document.querySelectorAll('.sidebar-nav-btn');
    buttons.forEach((btn) => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab === tab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Views Visibility
    const views = document.querySelectorAll('.app-view-container');
    views.forEach((view) => {
      const viewId = view.getAttribute('id');
      if (viewId === `view-${tab}`) {
        view.classList.remove('view-hidden');
      } else {
        view.classList.add('view-hidden');
      }
    });

    if (this.onTabChangeCallback) {
      this.onTabChangeCallback(tab);
    }
  }

  private bindEvents(): void {
    const buttons = document.querySelectorAll('.sidebar-nav-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as AppTab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });
  }
}
