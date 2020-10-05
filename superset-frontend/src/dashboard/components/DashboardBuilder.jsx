/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
/* eslint-env browser */
import cx from 'classnames';
// ParentSize uses resize observer so the dashboard will update size
// when its container size changes, due to e.g., builder side panel opening
import { ParentSize } from '@vx/responsive';
import PropTypes from 'prop-types';
import React from 'react';
import { Sticky, StickyContainer } from 'react-sticky';
import { TabContainer, TabContent, TabPane } from 'react-bootstrap';
import { styled } from '@superset-ui/core';

import BuilderComponentPane from 'src/dashboard/components/BuilderComponentPane';
import DashboardHeader from 'src/dashboard/containers/DashboardHeader';
import DashboardGrid from 'src/dashboard/containers/DashboardGrid';
import IconButton from 'src/dashboard/components/IconButton';
import DragDroppable from 'src/dashboard/components/dnd/DragDroppable';
import DashboardComponent from 'src/dashboard/containers/DashboardComponent';
import ToastPresenter from 'src/messageToasts/containers/ToastPresenter';
import WithPopoverMenu from 'src/dashboard/components/menu/WithPopoverMenu';

import getDragDropManager from 'src/dashboard/util/getDragDropManager';
import findTabIndexByComponentId from 'src/dashboard/util/findTabIndexByComponentId';

import getDirectPathToTabIndex from 'src/dashboard/util/getDirectPathToTabIndex';
import getLeafComponentIdFromPath from 'src/dashboard/util/getLeafComponentIdFromPath';
import {
  DASHBOARD_GRID_ID,
  DASHBOARD_ROOT_ID,
  DASHBOARD_ROOT_DEPTH,
} from '../util/constants';

const TABS_HEIGHT = 47;
const HEADER_HEIGHT = 67;

const propTypes = {
  // redux
  dashboardLayout: PropTypes.object.isRequired,
  deleteTopLevelTabs: PropTypes.func.isRequired,
  editMode: PropTypes.bool.isRequired,
  showBuilderPane: PropTypes.func.isRequired,
  colorScheme: PropTypes.string,
  setColorSchemeAndUnsavedChanges: PropTypes.func.isRequired,
  handleComponentDrop: PropTypes.func.isRequired,
  directPathToChild: PropTypes.arrayOf(PropTypes.string),
  focusedFilterField: PropTypes.object,
  setDirectPathToChild: PropTypes.func.isRequired,
  setMountedTab: PropTypes.func.isRequired,
};

const defaultProps = {
  showBuilderPane: false,
  directPathToChild: [],
  colorScheme: undefined,
};

const StyledDashboardContent = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  height: auto;

  .grid-container .dashboard-component-tabs {
    box-shadow: none;
    padding-left: 0;
  }

  & > div:first-child {
    width: 100%;
    flex-grow: 1;
    position: relative;
  }

  .dashboard-component-chart-holder {
    // transitionable traits to show filter relevance
    transition: all 0.2s;
    border: 2px solid transparent;
    box-shadow: 0px 0px 0px ${({ theme }) => theme.colors.primary.light5};
  }
  &.focused-filter-field {
    .dashboard-component-chart-holder {
      filter: blur(2px);
      opacity: 0.3;
      &.scoped-to-focused-filter,
      &.contains-focused-filter {
        border-color: ${({ theme }) => theme.colors.primary.light2};
        filter: blur(0);
        opacity: 1;
        box-shadow: 0px 0px 8px ${({ theme }) => theme.colors.primary.light2};
      }
    }
  }
`;

class DashboardBuilder extends React.Component {
  static shouldFocusTabs(event, container) {
    // don't focus the tabs when we click on a tab
    return (
      event.target.tagName === 'UL' ||
      (/icon-button/.test(event.target.className) &&
        container.contains(event.target))
    );
  }

  static getRootLevelTabIndex(dashboardLayout, directPathToChild) {
    return Math.max(
      0,
      findTabIndexByComponentId({
        currentComponent: DashboardBuilder.getRootLevelTabsComponent(
          dashboardLayout,
        ),
        directPathToChild,
      }),
    );
  }

  static getRootLevelTabsComponent(dashboardLayout) {
    const dashboardRoot = dashboardLayout[DASHBOARD_ROOT_ID];
    const rootChildId = dashboardRoot.children[0];
    return rootChildId === DASHBOARD_GRID_ID
      ? dashboardLayout[DASHBOARD_ROOT_ID]
      : dashboardLayout[rootChildId];
  }

  constructor(props) {
    super(props);

    const { dashboardLayout, directPathToChild } = props;
    const tabIndex = DashboardBuilder.getRootLevelTabIndex(
      dashboardLayout,
      directPathToChild,
    );
    this.state = {
      tabIndex,
    };

    this.handleChangeTab = this.handleChangeTab.bind(this);
    this.handleDeleteTopLevelTabs = this.handleDeleteTopLevelTabs.bind(this);
  }

  getChildContext() {
    return {
      dragDropManager: this.context.dragDropManager || getDragDropManager(),
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const nextFocusComponent = getLeafComponentIdFromPath(
      nextProps.directPathToChild,
    );
    const currentFocusComponent = getLeafComponentIdFromPath(
      this.props.directPathToChild,
    );
    if (nextFocusComponent !== currentFocusComponent) {
      const { dashboardLayout, directPathToChild } = nextProps;
      const nextTabIndex = DashboardBuilder.getRootLevelTabIndex(
        dashboardLayout,
        directPathToChild,
      );

      this.setState(() => ({ tabIndex: nextTabIndex }));
    }
  }

  handleDeleteTopLevelTabs() {
    this.props.deleteTopLevelTabs();

    const { dashboardLayout } = this.props;
    const firstTab = getDirectPathToTabIndex(
      DashboardBuilder.getRootLevelTabsComponent(dashboardLayout),
      0,
    );
    this.props.setDirectPathToChild(firstTab);
  }

  handleChangeTab({ pathToTabIndex }) {
    this.props.setDirectPathToChild(pathToTabIndex);
  }

  render() {
    const {
      handleComponentDrop,
      dashboardLayout,
      editMode,
      focusedFilterField,
      showBuilderPane,
      setColorSchemeAndUnsavedChanges,
      colorScheme,
    } = this.props;
    const { tabIndex } = this.state;
    const dashboardRoot = dashboardLayout[DASHBOARD_ROOT_ID];
    const rootChildId = dashboardRoot.children[0];
    const topLevelTabs =
      rootChildId !== DASHBOARD_GRID_ID && dashboardLayout[rootChildId];

    const childIds = topLevelTabs ? topLevelTabs.children : [DASHBOARD_GRID_ID];

    return (
      <StickyContainer
        className={cx('dashboard', editMode && 'dashboard--editing')}
      >
        <Sticky>
          {({ style }) => (
            <DragDroppable
              component={dashboardRoot}
              parentComponent={null}
              depth={DASHBOARD_ROOT_DEPTH}
              index={0}
              orientation="column"
              onDrop={handleComponentDrop}
              editMode={editMode}
              // you cannot drop on/displace tabs if they already exist
              disableDragdrop={!!topLevelTabs}
              style={{ zIndex: 100, ...style }}
            >
              {({ dropIndicatorProps }) => (
                <div>
                  <DashboardHeader />
                  {dropIndicatorProps && <div {...dropIndicatorProps} />}
                  {topLevelTabs && (
                    <WithPopoverMenu
                      shouldFocus={DashboardBuilder.shouldFocusTabs}
                      menuItems={[
                        <IconButton
                          className="fa fa-level-down"
                          label="Collapse tab content"
                          onClick={this.handleDeleteTopLevelTabs}
                        />,
                      ]}
                      editMode={editMode}
                    >
                      <DashboardComponent
                        id={topLevelTabs.id}
                        parentId={DASHBOARD_ROOT_ID}
                        depth={DASHBOARD_ROOT_DEPTH + 1}
                        index={0}
                        renderTabContent={false}
                        renderHoverMenu={false}
                        onChangeTab={this.handleChangeTab}
                      />
                    </WithPopoverMenu>
                  )}
                </div>
              )}
            </DragDroppable>
          )}
        </Sticky>

        <StyledDashboardContent
          className={cx(focusedFilterField && 'focused-filter-field')}
        >
          <div className="grid-container">
            <ParentSize>
              {({ width }) => (
                /*
                  We use a TabContainer irrespective of whether top-level tabs exist to maintain
                  a consistent React component tree. This avoids expensive mounts/unmounts of
                  the entire dashboard upon adding/removing top-level tabs, which would otherwise
                  happen because of React's diffing algorithm
                */
                <TabContainer
                  id={DASHBOARD_GRID_ID}
                  activeKey={Math.min(tabIndex, childIds.length - 1)}
                  onSelect={this.handleChangeTab}
                  animation
                  mountOnEnter
                  unmountOnExit={false}
                >
                  <TabContent>
                    {childIds.map((id, index) => (
                      // Matching the key of the first TabPane irrespective of topLevelTabs
                      // lets us keep the same React component tree when !!topLevelTabs changes.
                      // This avoids expensive mounts/unmounts of the entire dashboard.
                      <TabPane
                        key={index === 0 ? DASHBOARD_GRID_ID : id}
                        eventKey={index}
                        mountOnEnter
                        unmountOnExit={false}
                        onEntering={() => {
                          // Entering current tab, DOM is visible and has dimension
                          this.props.setMountedTab(id);
                        }}
                      >
                        <DashboardGrid
                          gridComponent={dashboardLayout[id]}
                          // see isValidChild for why tabs do not increment the depth of their children
                          depth={DASHBOARD_ROOT_DEPTH + 1} // (topLevelTabs ? 0 : 1)}
                          width={width}
                          isComponentVisible={index === tabIndex}
                        />
                      </TabPane>
                    ))}
                  </TabContent>
                </TabContainer>
              )}
            </ParentSize>
          </div>
          {editMode && (
            <BuilderComponentPane
              topOffset={HEADER_HEIGHT + (topLevelTabs ? TABS_HEIGHT : 0)}
              showBuilderPane={showBuilderPane}
              setColorSchemeAndUnsavedChanges={setColorSchemeAndUnsavedChanges}
              colorScheme={colorScheme}
            />
          )}
        </StyledDashboardContent>
        <ToastPresenter />
      </StickyContainer>
    );
  }
}

DashboardBuilder.propTypes = propTypes;
DashboardBuilder.defaultProps = defaultProps;
DashboardBuilder.childContextTypes = {
  dragDropManager: PropTypes.object.isRequired,
};

export default DashboardBuilder;
