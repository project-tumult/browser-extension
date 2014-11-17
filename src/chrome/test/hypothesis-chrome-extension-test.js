describe('HypotheisChromeExtension', function () {
  'use strict';

  var assert = chai.assert;
  var sandbox = sinon.sandbox.create();
  var HypotheisChromeExtension = h.HypotheisChromeExtension;
  var ext;
  var fakeChromeTabs;
  var fakeChromeBrowserAction;
  var fakeTabStore;
  var fakeTabState;
  var fakeBrowserAction;
  var fakeSidebarInjector;

  function createExt() {
    return new HypotheisChromeExtension({
      chromeTabs: fakeChromeTabs,
      chromeBrowserAction: fakeChromeBrowserAction,
      extensionURL: sinon.stub(),
      isAllowedFileSchemeAccess: sinon.stub().yields(true)
    });
  }

  beforeEach(function () {
    fakeChromeTabs = {};
    fakeChromeBrowserAction = {};
    fakeTabStore = {all: sinon.spy(), set: sinon.spy()};
    fakeTabState = {
      activateTab: sinon.spy(),
      deactivateTab: sinon.spy(),
      errorTab: sinon.spy(),
      previousState: sinon.spy(),
      isTabActive: sinon.stub().returns(false),
      isTabInactive: sinon.stub().returns(false),
      isTabErrored: sinon.stub().returns(false),
    };
    fakeBrowserAction = {
      setState: sinon.spy()
    };
    fakeSidebarInjector = {
      injectIntoTab: sinon.spy(),
      removeFromTab: sinon.spy(),
    };

    sandbox.stub(h, 'TabStore').returns(fakeTabStore);
    sandbox.stub(h, 'TabState').returns(fakeTabState);
    sandbox.stub(h, 'BrowserAction').returns(fakeBrowserAction);
    sandbox.stub(h, 'SidebarInjector').returns(fakeSidebarInjector);

    ext = createExt();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('.install', function () {
    var tabs;

    beforeEach(function () {
      tabs = [];
      fakeChromeTabs.query = sinon.stub().yields(tabs);

      fakeTabState.isTabActive = sinon.stub().returns(false);
      fakeTabState.activateTab = sinon.spy();
      fakeTabState.deactivateTab = sinon.spy();
    });

    it('sets up the state for tabs', function () {
      tabs.push({id: 1, url: 'http://example.com'});
      ext.install();
      sinon.assert.calledWith(fakeTabState.deactivateTab, 1);
    });

    it('sets up the state for existing tabs', function () {
      fakeTabState.isTabActive.returns(true);
      tabs.push({id: 1, url: 'http://example.com'});
      ext.install();
      sinon.assert.calledWith(fakeTabState.activateTab, 1);
    });
  });

  describe('.listen', function () {
    var onClickedHandler;
    var onCreatedHandler;
    var onUpdatedHandler;
    var onRemovedHandler;

    beforeEach(function () {
      fakeChromeBrowserAction.onClicked = {
        addListener: sinon.spy(function (fn) {
          onClickedHandler = fn;
        })
      };
      fakeChromeTabs.onCreated = {
        addListener: sinon.spy(function (fn) {
          onCreatedHandler = fn;
        })
      };
      fakeChromeTabs.onUpdated = {
        addListener: sinon.spy(function (fn) {
          onUpdatedHandler = fn;
        })
      };
      fakeChromeTabs.onRemoved = {
        addListener: sinon.spy(function (fn) {
          onRemovedHandler = fn;
        })
      };
    });

    it('sets up event listeners', function () {
      ext.listen({addEventListener: sinon.stub()});
      sinon.assert.called(fakeChromeBrowserAction.onClicked.addListener);
      sinon.assert.called(fakeChromeTabs.onCreated.addListener);
      sinon.assert.called(fakeChromeTabs.onUpdated.addListener);
      sinon.assert.called(fakeChromeTabs.onRemoved.addListener);
    });

    describe('when a tab is created', function () {
      beforeEach(function () {
        fakeTabState.deactivateTab = sinon.spy();
        ext.listen({addEventListener: sinon.stub()});
      });

      it('registers the new tab', function () {
        onCreatedHandler({id: 1, url: 'http://example.com/foo.html'});
        sinon.assert.calledWith(fakeTabState.deactivateTab, 1);
      });
    });

    describe('when a tab is updated', function () {
      beforeEach(function () {
        fakeTabState.restorePreviousState = sinon.spy();

        ext.listen({addEventListener: sinon.stub()});
      });

      it('injects the sidebar if the tab is active', function () {
        var tab = {id: 1, url: 'http://example.com/foo.html'};
        fakeTabState.isTabActive.withArgs(1).returns(true);
        onUpdatedHandler(tab);
        sinon.assert.calledWith(fakeSidebarInjector.injectIntoTab, tab);
      });

      it('removes the sidebar if inactive', function () {
        var tab = {id: 1, url: 'http://example.com/foo.html'};
        fakeTabState.isTabInactive.withArgs(1).returns(true);
        onUpdatedHandler(tab);
        sinon.assert.calledWith(fakeSidebarInjector.removeFromTab, tab);
      });

      it('restores the tab state if errored', function () {
        var tab = {id: 1, url: 'http://example.com/foo.html'};
        fakeTabState.isTabErrored.returns(true);
        onUpdatedHandler(tab);
        sinon.assert.calledWith(fakeTabState.restorePreviousState, 1);
      });
    });

    describe('when a tab is removed', function () {
      beforeEach(function () {
        fakeTabState.clearTab = sinon.spy();
        ext.listen({addEventListener: sinon.stub()});
      });

      it('clears the tab', function () {
        onRemovedHandler({id: 1, url: 'http://example.com/foo.html'});
        sinon.assert.calledWith(fakeTabState.clearTab, 1);
      });
    });

    describe('when the browser icon is clicked', function () {
      beforeEach(function () {
        ext.listen({addEventListener: sinon.stub()});
      });

      it('activate the tab if the tab is inactive', function () {
        fakeTabState.isTabInactive.returns(true);
        onClickedHandler({id: 1, url: 'http://example.com/foo.html'});
        sinon.assert.called(fakeTabState.activateTab);
        sinon.assert.calledWith(fakeTabState.activateTab, 1);
      });

      it('deactivate the tab if the tab is active', function () {
        fakeTabState.isTabActive.returns(true);
        onClickedHandler({id: 1, url: 'http://example.com/foo.html'});
        sinon.assert.called(fakeTabState.deactivateTab);
        sinon.assert.calledWith(fakeTabState.deactivateTab, 1);
      });

      it('shows help if the tab is errored');
    });
  });

  describe('TabState.onchange', function () {
    var onChangeHandler;

    beforeEach(function () {
      fakeChromeTabs.get = sinon.stub().yields({id: 1});
      onChangeHandler = h.TabState.lastCall.args[1];
    });

    it('updates the browser icon', function () {
      onChangeHandler(1, 'active', 'inactive');
      sinon.assert.calledWith(fakeBrowserAction.setState, 1, 'active');
    });

    it('updates the TabStore if the tab has not errored', function () {
      onChangeHandler(1, 'active', 'inactive');
      sinon.assert.calledWith(fakeTabStore.set, 1, 'active');
    });

    it('does not update the TabStore if the tab has errored', function () {
      fakeTabState.isTabErrored.returns(true);
      onChangeHandler(1, 'errored', 'inactive');
      sinon.assert.notCalled(fakeTabStore.set);
    });

    it('injects the sidebar if the tab has been activated', function () {
      fakeTabState.isTabActive.returns(true);
      onChangeHandler(1, 'active', 'inactive');
      sinon.assert.calledWith(fakeSidebarInjector.injectIntoTab, {id: 1});
    });

    it('removes the sidebar if the tab has been deactivated', function () {
      fakeTabState.isTabInactive.returns(true);
      onChangeHandler(1, 'inactive', 'active');
      sinon.assert.calledWith(fakeSidebarInjector.removeFromTab, {id: 1});
    });

    it('does nothing with the sidebar if the tab is errored', function () {
      fakeTabState.isTabErrored.returns(true);
      onChangeHandler(1, 'errored', 'inactive');
      sinon.assert.notCalled(fakeSidebarInjector.injectIntoTab);
      sinon.assert.notCalled(fakeSidebarInjector.removeFromTab);
    });
  });
});