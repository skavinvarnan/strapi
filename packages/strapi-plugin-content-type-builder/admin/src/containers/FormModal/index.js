import React, { useEffect, useReducer, useRef, useState } from 'react';
import {
  ButtonModal,
  HeaderModal,
  HeaderModalTitle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalForm,
  getYupInnerErrors,
  useGlobalContext,
  InputsIndex,
} from 'strapi-helper-plugin';
import { Inputs } from '@buffetjs/custom';
import { useHistory, useLocation } from 'react-router-dom';
import { FormattedMessage } from 'react-intl';
import { get, has, isEmpty, set, toString, upperFirst } from 'lodash';
import pluginId from '../../pluginId';
import useQuery from '../../hooks/useQuery';
import useDataManager from '../../hooks/useDataManager';
import AttributeOption from '../../components/AttributeOption';
import BooleanBox from '../../components/BooleanBox';
import ComponentIconPicker from '../../components/ComponentIconPicker';
import CustomCheckbox from '../../components/CustomCheckbox';
import ModalHeader from '../../components/ModalHeader';
import HeaderModalNavContainer from '../../components/HeaderModalNavContainer';
import RelationForm from '../../components/RelationForm';
import HeaderNavLink from '../../components/HeaderNavLink';
import WrapperSelect from '../../components/WrapperSelect';
import getTrad from '../../utils/getTrad';
import getAttributes from './utils/attributes';
import forms from './utils/forms';
import { createComponentUid, createUid } from './utils/createUid';
import getModalTitleSubHeader from './utils/getModalTitleSubHeader';
import getNextSearch from './utils/getNextSearch';
import { NAVLINKS, INITIAL_STATE_DATA } from './utils/staticData';
import init from './init';
import reducer, { initialState } from './reducer';

const FormModal = () => {
  const [state, setState] = useState(INITIAL_STATE_DATA);
  const [reducerState, dispatch] = useReducer(reducer, initialState, init);
  const { push } = useHistory();
  const { search } = useLocation();
  const { formatMessage } = useGlobalContext();
  const query = useQuery();
  const attributeOptionRef = useRef();
  const {
    addAttribute,
    addCreatedComponentToDynamicZone,
    changeDynamicZoneComponents,
    contentTypes,
    components,
    createSchema,
    modifiedData: allDataSchema,
    nestedComponents,
    sortedContentTypesList,
  } = useDataManager();
  const {
    componentToCreate,
    formErrors,
    initialData,
    isCreatingComponentWhileAddingAField,
    modifiedData,
  } = reducerState.toJS();

  useEffect(() => {
    if (!isEmpty(search)) {
      const actionType = query.get('actionType');
      // Return 'null' if there isn't any attributeType search params
      const attributeName = query.get('attributeName');
      const attributeType = query.get('attributeType');
      const dynamicZoneTarget = query.get('dynamicZoneTarget');
      const forTarget = query.get('forTarget');
      const headerDisplayCategory = query.get('headerDisplayCategory');
      const headerDisplayName = query.get('headerDisplayName');
      const modalType = query.get('modalType');
      const targetUid = query.get('targetUid');
      const settingType = query.get('settingType');
      const step = query.get('step');
      const pathToSchema =
        forTarget === 'contentType' || forTarget === 'component'
          ? [forTarget]
          : [forTarget, targetUid];

      setState({
        actionType,
        attributeName,
        attributeType,
        dynamicZoneTarget,
        headerDisplayName,
        headerDisplayCategory,
        forTarget,
        modalType,
        pathToSchema,
        settingType,
        step,
        targetUid,
      });

      // Special case for the dynamic zone
      if (
        modalType === 'addComponentToDynamicZone' &&
        state.modalType !== 'addComponentToDynamicZone' &&
        actionType === 'edit'
      ) {
        const attributeToEditNotFormatted = get(
          allDataSchema,
          [...pathToSchema, 'schema', 'attributes', dynamicZoneTarget],
          {}
        );
        const attributeToEdit = {
          ...attributeToEditNotFormatted,
          name: dynamicZoneTarget,
          // createComponent: true,
          createComponent: false,
          componentToCreate: { type: 'component' },
        };

        dispatch({
          type: 'SET_DYNAMIC_ZONE_DATA_SCHEMA',
          attributeToEdit,
        });
      }

      // Set the predefined data structure to create an attribute
      if (
        attributeType &&
        attributeType !== 'null' &&
        // This condition is added to prevent the reducer state to be cleared when navigating from the base tab to tha advanced one
        state.modalType !== 'attribute'
      ) {
        const attributeToEditNotFormatted = get(
          allDataSchema,
          [...pathToSchema, 'schema', 'attributes', attributeName],
          {}
        );
        const attributeToEdit = {
          ...attributeToEditNotFormatted,
          name: attributeName,
        };

        // We need to set the repeatable key to false when editing a component
        // The API doesn't send this info
        if (attributeType === 'component' && actionType === 'edit') {
          if (!attributeToEdit.repeatable) {
            set(attributeToEdit, 'repeatable', false);
          }
        }

        if (
          attributeType === 'relation' &&
          !has(attributeToEdit, ['targetAttribute'])
        ) {
          set(attributeToEdit, ['targetAttribute'], '-');
        }

        dispatch({
          type: 'SET_ATTRIBUTE_DATA_SCHEMA',
          attributeType,
          nameToSetForRelation: get(
            sortedContentTypesList,
            ['0', 'title'],
            'error'
          ),
          targetUid: get(sortedContentTypesList, ['0', 'uid'], 'error'),
          isEditing: actionType === 'edit',
          modifiedDataToSetForEditing: attributeToEdit,
          step,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const form = get(forms, [state.modalType, 'form', state.settingType], () => ({
    items: [],
  }));

  // TODO improve icon logic
  let iconType = ['components', 'contentType'].includes(state.modalType)
    ? state.modalType
    : state.forTarget;

  if (state.modalType === 'addComponentToDynamicZone') {
    iconType = 'dynamiczone';
  }
  const isCreatingContentType = state.modalType === 'contentType';
  const isCreatingComponent = state.modalType === 'component';
  const isCreatingAttribute = state.modalType === 'attribute';
  const isComponentAttribute =
    state.attributeType === 'component' && isCreatingAttribute;

  const isCreating = state.actionType === 'create';
  const isCreatingComponentFromAView =
    get(modifiedData, 'createComponent', false) ||
    isCreatingComponentWhileAddingAField;
  const isInFirstComponentStep = state.step === '1';

  const isOpen = !isEmpty(search);
  const isPickingAttribute = state.modalType === 'chooseAttribute';
  const uid = createUid(modifiedData.name || '');

  let headerId = isCreating
    ? `modalForm.${state.modalType}.header-create`
    : 'modalForm.header-edit';

  if (!['contentType', 'component'].includes(state.modalType)) {
    headerId = null;
  }

  const checkFormValidity = async () => {
    let schema;
    const dataToValidate =
      isCreatingComponentFromAView && state.step === '1'
        ? get(modifiedData, 'componentToCreate', {})
        : modifiedData;

    // Check form validity for content type
    if (isCreatingContentType) {
      schema = forms.contentType.schema(Object.keys(contentTypes));

      // Check form validity for component
      // This is happening when the user click on the link from the left menu
    } else if (isCreatingComponent) {
      schema = forms.component.schema(
        Object.keys(components),
        modifiedData.category || ''
      );

      // Check for validity for creating a component
      // This is happening when the user creates a component "on the fly"
      // Since we temporarily store the component info in another object
      // The data is set in the componentToCreate key
    } else if (
      isComponentAttribute &&
      isCreatingComponentFromAView &&
      isInFirstComponentStep
    ) {
      schema = forms.component.schema(
        Object.keys(components),
        get(modifiedData, 'componentToCreate.category', '')
      );

      // Check form validity for creating a 'common attribute'
      // We need to make sure that it is independent from the step
    } else if (isCreatingAttribute && !isInFirstComponentStep) {
      const type =
        state.attributeType === 'relation' ? 'relation' : modifiedData.type;

      schema = forms[state.modalType].schema(
        get(allDataSchema, state.pathToSchema, {}),
        type,
        modifiedData,
        state.actionType === 'edit',
        state.attributeName,
        initialData
      );

      // The user is either in the addComponentToDynamicZone modal or
      // in step 1 of the add component (modalType=attribute&attributeType=component) but not creating a component
    } else {
      if (isInFirstComponentStep && isCreatingComponentFromAView) {
        schema = forms.component.schema(
          Object.keys(components),
          get(modifiedData, 'componentToCreate.category', '')
        );
      } else {
        // The form is valid
        // TODO validate case dz not creating component
        return;
      }
    }

    await schema.validate(dataToValidate, { abortEarly: false });
  };

  const handleClickAddComponentsToDynamicZone = ({
    target: { name, components, shouldAddComponents },
  }) => {
    dispatch({
      type: 'ADD_COMPONENTS_TO_DYNAMIC_ZONE',
      name,
      components,
      shouldAddComponents,
    });
  };

  const handleChange = ({ target: { name, value, type, ...rest } }) => {
    const namesThatCanResetToNullValue = [
      'enumName',
      'max',
      'min',
      'maxLength',
      'minLength',
    ];
    let val;

    if (
      ['default', ...namesThatCanResetToNullValue].includes(name) &&
      value === ''
    ) {
      val = null;
    } else if (
      type === 'radio' &&
      (name === 'multiple' ||
        name === 'single' ||
        name === 'createComponent' ||
        name === 'repeatable')
    ) {
      val = value === 'false' ? false : true;

      // The boolean default accepts 3 different values
      // This check has been added to allow a reset to null for the bool
    } else if (type === 'radio' && name === 'default') {
      if (value === 'false') {
        val = false;
      } else if (value === 'true') {
        val = true;
      } else {
        val = null;
      }

      // We store an array for the enum
    } else if (name === 'enum') {
      val = value.split('\n');
    } else {
      val = value;
    }

    const clonedErrors = Object.assign({}, formErrors);

    // Reset min error when modifying the max
    if (name === 'max') {
      delete clonedErrors.min;
    }

    // Same here
    if (name === 'maxLength') {
      delete clonedErrors.minLength;
    }

    // Since the onBlur is deactivated we remove the errors directly when changing an input
    delete clonedErrors[name];

    dispatch({
      type: 'SET_ERRORS',
      errors: clonedErrors,
    });

    dispatch({
      type: 'ON_CHANGE',
      keys: name.split('.'),
      value: val,
      ...rest,
    });
  };
  const handleSubmit = async e => {
    e.preventDefault();

    try {
      await checkFormValidity();
      const targetUid =
        state.forTarget === 'components' ? state.targetUid : uid;
      // This should be improved
      const createNextSearch = searchUid => {
        return `modalType=chooseAttribute&forTarget=${
          state.forTarget
        }&targetUid=${searchUid}&headerDisplayName=${state.headerDisplayName ||
          modifiedData.name}`;
      };

      if (isCreatingContentType) {
        // Create the content type schema
        createSchema(modifiedData, state.modalType, uid);

        push({
          pathname: `/plugins/${pluginId}/content-types/${uid}`,
          search: createNextSearch(targetUid),
        });
      } else if (isCreatingComponent) {
        // Create the component schema
        const componentUid = createComponentUid(
          modifiedData.name,
          modifiedData.category
        );
        const { category, ...rest } = modifiedData;
        createSchema(rest, 'component', componentUid, category);

        push({
          search: createNextSearch(componentUid),
          pathname: `/plugins/${pluginId}/component-categories/${category}/${componentUid}`,
        });

        // Add/edit a field
      } else if (isCreatingAttribute && !isCreatingComponentFromAView) {
        // Normal fields like boolean relations or dynamic zone
        if (!isComponentAttribute) {
          addAttribute(
            modifiedData,
            state.forTarget,
            state.targetUid,
            state.actionType === 'edit',
            initialData
          );
          const isDynamicZoneAttribute = state.attributeType === 'dynamiczone';
          console.log('oooo');
          // Adding a component to a dynamiczone is not the same logic as creating a simple field
          // so the search is different
          // TODO make sure it works for edit
          // const dzSearch = `modalType=addComponentToDynamicZone&forTarget=contentType&targetUid=${state.targetUid}&headerDisplayName=${state.headerDisplayName}&dynamicZoneTarget=${modifiedData.name}&settingType=base&step=1&actionType=create`;

          // For the modal header
          const displayCategory = state.headerDisplayName;
          const displayName = modifiedData.name;
          const dzSearch = `modalType=addComponentToDynamicZone&forTarget=contentType&targetUid=${state.targetUid}&headerDisplayName=${displayName}&headerDisplayCategory=${displayCategory}&dynamicZoneTarget=${modifiedData.name}&settingType=base&step=1&actionType=create`;
          const nextSearch = isDynamicZoneAttribute
            ? dzSearch
            : createNextSearch(targetUid);

          if (state.attributeType === 'dynamiczone' && !isCreating) {
            push({ search: '' });
          } else {
            if (isDynamicZoneAttribute) {
              // Step 1 of adding a component to a DZ, the user has the option to create a component
              dispatch({
                type: 'RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ',
              });

              push({ search: nextSearch });
              return;
            }

            push({ search: nextSearch });
          }

          // Adding an existing component
        } else {
          if (isInFirstComponentStep) {
            // Navigate the user to step 2
            push({
              search: `modalType=attribute&actionType=${state.actionType}&settingType=base&forTarget=${state.forTarget}&targetUid=${state.targetUid}&attributeType=component&headerDisplayName=${state.headerDisplayName}&step=2`,
            });

            // Clear the reducer and prepare the modified data
            // This way we don't have to add some logic to re-run the useEffect
            // The first step is either needed to create a component or just to navigate
            // To the modal for adding a "common field"
            dispatch({
              type: 'RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO',
            });

            // We don't want all the props to be reset
            return;

            // Here we are in step 2
            // The step 2 is also use to edit an attribute that is a component
          } else {
            addAttribute(
              modifiedData,
              state.forTarget,
              state.targetUid,
              // This change the dispatched type
              // either 'EDIT_ATTRIBUTE' or 'ADD_ATTRIBUTE' in the DataManagerProvider
              state.actionType === 'edit',
              // This is for the edit part
              initialData,
              // Passing true will add the component to the components object
              // This way we can add fields to the added component (if it wasn't there already)
              true
            );

            push({ search: createNextSearch(targetUid) });

            // We don't need to end the loop here we want the reducer to be reinitialised
          }
        }
        // Logic for creating a component without clicking on the link in
        // the left menu
        // We need to separate the logic otherwise the component would be created
        // even though the user didn't set any field
        // The use case is happening when closing the modal at step 2 without any submission
      } else if (isCreatingAttribute && isCreatingComponentFromAView) {
        if (isInFirstComponentStep) {
          // Here the search could be refactored since it is the same as the case from above
          push({
            search: `modalType=attribute&actionType=${state.actionType}&settingType=base&forTarget=${state.forTarget}&targetUid=${state.targetUid}&attributeType=component&headerDisplayName=${state.headerDisplayName}&step=2`,
          });

          // Here we clear the reducer state but we also keep the created component
          // If we were to create the component before
          dispatch({
            type: 'RESET_PROPS_AND_SAVE_CURRENT_DATA',
          });

          // Terminate because we don't want the reducer to be entirely reset
          return;

          // Step 2
        } else {
          // We are destructuring because the modifiedData object doesn't have the appropriate format to create a field
          const { category, type, ...rest } = componentToCreate;
          // Create a the component temp UID
          // This could be refactored but I think it's more understandable to separate the logic
          const componentUid = createComponentUid(
            componentToCreate.name,
            category
          );
          // Create the component first and add it to the components data
          createSchema(
            // Component data
            rest,
            // Type will always be component
            // It will dispatch the CREATE_COMPONENT_SCHEMA action
            // So the component will be added in the main components object
            // This might not be needed if we don't allow navigation between entries while editing
            type,
            componentUid,
            category,
            // This will add the created component in the datamanager modifiedData components key
            // Like explained above we will be able to modify the created component structure
            isCreatingComponentFromAView
          );
          // Add the field to the schema
          addAttribute(modifiedData, state.forTarget, state.targetUid, false);

          // TODO temporary
          dispatch({ type: 'RESET_PROPS' });
          push({ search: '' });
          return;
        }
        // The modal is addComponentToDynamicZone
      } else {
        if (isInFirstComponentStep) {
          if (isCreatingComponentFromAView) {
            const { category, type, ...rest } = modifiedData.componentToCreate;
            const componentUid = createComponentUid(
              modifiedData.componentToCreate.name,
              category
            );
            // Create the component first and add it to the components data
            createSchema(
              // Component data
              rest,
              // Type will always be component
              // It will dispatch the CREATE_COMPONENT_SCHEMA action
              // So the component will be added in the main components object
              // This might not be needed if we don't allow navigation between entries while editing
              type,
              componentUid,
              category,
              // This will add the created component in the datamanager modifiedData components key
              // Like explained above we will be able to modify the created component structure
              isCreatingComponentFromAView
            );
            // Add the created component to the DZ
            // We don't want to remove the old ones
            addCreatedComponentToDynamicZone(state.dynamicZoneTarget, [
              componentUid,
            ]);

            // TODO change routing so the user can add fields to the created component
            push({ search: '' });
          } else {
            // Add the components to the DZ
            changeDynamicZoneComponents(
              state.dynamicZoneTarget,
              modifiedData.components
            );

            // TODO nav
            push({ search: '' });
          }
        } else {
          console.error('This case is not handled');
        }

        return;
      }

      dispatch({
        type: 'RESET_PROPS',
      });
    } catch (err) {
      const errors = getYupInnerErrors(err);

      dispatch({
        type: 'SET_ERRORS',
        errors,
      });
    }
  };
  const handleToggle = () => {
    push({ search: '' });
  };

  const onClosed = () => {
    setState(INITIAL_STATE_DATA);
    dispatch({
      type: 'RESET_PROPS',
    });
  };
  const onOpened = () => {
    if (state.modalType === 'chooseAttribute') {
      attributeOptionRef.current.focus();
    }
  };
  const shouldDisableAdvancedTab = () => {
    return (
      // isCreatingAttribute &&
      (state.attributeType === 'component' ||
        state.modalType === 'addComponentToDynamicZone') &&
      get(modifiedData, ['createComponent'], null) === false
    );
  };

  // Display data for the attributes picker modal
  const displayedAttributes = getAttributes(
    state.forTarget,
    state.targetUid,
    nestedComponents
  );

  // Styles
  const modalBodyStyle = isPickingAttribute
    ? { paddingTop: '0.5rem', paddingBottom: '3rem' }
    : {};

  return (
    <Modal
      isOpen={isOpen}
      onOpened={onOpened}
      onClosed={onClosed}
      onToggle={handleToggle}
      withoverflow={toString(state.modalType === 'addComponentToDynamicZone')}
    >
      <HeaderModal>
        <ModalHeader
          // We need to add the category here
          name={state.headerDisplayName}
          category={state.headerDisplayCategory}
          headerId={headerId}
          iconType={iconType || 'contentType'}
          target={state.forTarget}
          targetUid={state.targetUid}
        />
        <section>
          <HeaderModalTitle>
            <FormattedMessage
              id={getModalTitleSubHeader(state)}
              values={{
                type: upperFirst(
                  formatMessage({
                    id: getTrad(`attribute.${state.attributeType}`),
                  })
                ),
                name: upperFirst(state.attributeName),
                step: state.step,
              }}
            >
              {msg => <span>{upperFirst(msg)}</span>}
            </FormattedMessage>

            {!isPickingAttribute && (
              <>
                <div className="settings-tabs">
                  <HeaderModalNavContainer>
                    {NAVLINKS.map((link, index) => {
                      return (
                        <HeaderNavLink
                          // The advanced tab is disabled when adding an existing component
                          // step 1
                          isDisabled={index === 1 && shouldDisableAdvancedTab()}
                          isActive={state.settingType === link.id}
                          key={link.id}
                          {...link}
                          onClick={() => {
                            setState(prev => ({
                              ...prev,
                              settingType: link.id,
                            }));
                            push({ search: getNextSearch(link.id, state) });
                          }}
                          nextTab={
                            index === NAVLINKS.length - 1 ? 0 : index + 1
                          }
                        />
                      );
                    })}
                  </HeaderModalNavContainer>
                </div>
                <hr />
              </>
            )}
          </HeaderModalTitle>
        </section>
      </HeaderModal>
      <form onSubmit={handleSubmit}>
        <ModalForm>
          <ModalBody style={modalBodyStyle}>
            <div className="container-fluid">
              {isPickingAttribute
                ? displayedAttributes.map((row, i) => {
                    return (
                      <div key={i} className="row">
                        {i === 1 && (
                          <hr
                            style={{
                              width: 'calc(100% - 30px)',
                              marginBottom: 25,
                            }}
                          />
                        )}
                        {row.map((attr, index) => {
                          const tabIndex =
                            i === 0
                              ? index
                              : displayedAttributes[0].length + index;

                          return (
                            <AttributeOption
                              key={attr}
                              tabIndex={tabIndex}
                              isDisplayed
                              onClick={() => {}}
                              ref={
                                i === 0 && index === 0
                                  ? attributeOptionRef
                                  : null
                              }
                              type={attr}
                            />
                          );
                        })}
                      </div>
                    );
                  })
                : form(modifiedData, state.attributeType, state.step).items.map(
                    (row, index) => {
                      return (
                        <div className="row" key={index}>
                          {row.map((input, i) => {
                            // The divider type is used mainly the advanced tab
                            // It is the one responsible for displaying the settings label
                            if (input.type === 'divider') {
                              return (
                                <div
                                  className="col-12"
                                  style={{
                                    marginBottom: '1.7rem',
                                    marginTop: -2,
                                    fontWeight: 500,
                                  }}
                                  key="divider"
                                >
                                  <FormattedMessage
                                    id={getTrad(
                                      'form.attribute.item.settings.name'
                                    )}
                                  />
                                </div>
                              );
                            }

                            // The spacer type is used mainly to aligne the icon picker
                            if (input.type === 'spacer') {
                              return (
                                <div key="spacer" style={{ height: 20 }}></div>
                              );
                            }

                            if (input.type === 'pushRight') {
                              return (
                                <div
                                  key={`${index}.${i}`}
                                  className={`col-${input.size}`}
                                />
                              );
                            }

                            if (input.type === 'relation') {
                              return (
                                <RelationForm
                                  key="relation"
                                  mainBoxHeader={state.headerDisplayName}
                                  modifiedData={modifiedData}
                                  naturePickerType={state.forTarget}
                                  onChange={handleChange}
                                  errors={formErrors}
                                />
                              );
                            }

                            // Retrieve the error for a specific input
                            const errorId = get(
                              formErrors,
                              [
                                ...input.name
                                  .split('.')
                                  // The filter here is used when creating a component
                                  // in the component step 1 modal
                                  // Since the component info is stored in the
                                  // componentToCreate object we can access the error
                                  // By removing the key
                                  .filter(key => key !== 'componentToCreate'),
                                'id',
                              ],
                              null
                            );

                            const retrievedValue = get(
                              modifiedData,
                              input.name,
                              ''
                            );

                            let value;

                            // Condition for the boolean default value
                            // The radio input doesn't accept false, true or null as value
                            // So we pass them as string
                            // This way the data stays accurate and we don't have to operate
                            // any data mutation
                            if (
                              input.name === 'default' &&
                              state.attributeType === 'boolean'
                            ) {
                              value = toString(retrievedValue);
                              // Same here for the enum
                            } else if (
                              input.name === 'enum' &&
                              Array.isArray(retrievedValue)
                            ) {
                              value = retrievedValue.join('\n');
                            } else {
                              value = retrievedValue;
                            }

                            // The addon input is not present in buffet so we are used the all lib
                            // for the moment that's why we don't want them be passed to buffet
                            // like the other created inputs
                            if (input.type === 'addon') {
                              return (
                                <InputsIndex
                                  key={input.name}
                                  {...input}
                                  type="string"
                                  onChange={handleChange}
                                  value={value}
                                />
                              );
                            }

                            return (
                              <div
                                className={`col-${input.size || 6}`}
                                key={input.name}
                              >
                                <Inputs
                                  addComponentsToDynamicZone={
                                    handleClickAddComponentsToDynamicZone
                                  }
                                  customInputs={{
                                    componentIconPicker: ComponentIconPicker,
                                    componentSelect: WrapperSelect,
                                    creatableSelect: WrapperSelect,
                                    customCheckboxWithChildren: CustomCheckbox,
                                    booleanBox: BooleanBox,
                                  }}
                                  isCreating={isCreating}
                                  // Props for the componentSelect
                                  isCreatingComponentWhileAddingAField={
                                    isCreatingComponentWhileAddingAField
                                  }
                                  // Props for the componentSelect
                                  // Since the component is created after adding it to a type
                                  // its name and category can't be retrieved from the data manager
                                  componentCategoryNeededForAddingAfieldWhileCreatingAComponent={get(
                                    componentToCreate,
                                    'category',
                                    null
                                  )}
                                  // Props for the componentSelect same explanation
                                  componentNameNeededForAddingAfieldWhileCreatingAComponent={get(
                                    componentToCreate,
                                    'name',
                                    null
                                  )}
                                  isAddingAComponentToAnotherComponent={
                                    state.forTarget === 'components' ||
                                    state.forTarget === 'component'
                                  }
                                  value={value}
                                  {...input}
                                  error={
                                    isEmpty(errorId)
                                      ? null
                                      : formatMessage({ id: errorId })
                                  }
                                  onChange={handleChange}
                                  onBlur={() => {}}
                                  description={
                                    get(input, 'description.id', null)
                                      ? formatMessage(input.description)
                                      : input.description
                                  }
                                  placeholder={
                                    get(input, 'placeholder.id', null)
                                      ? formatMessage(input.placeholder)
                                      : input.placeholder
                                  }
                                  label={
                                    get(input, 'label.id', null)
                                      ? formatMessage(input.label)
                                      : input.label
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                  )}
            </div>
          </ModalBody>
        </ModalForm>
        {!isPickingAttribute && (
          <ModalFooter>
            <section>
              <ButtonModal
                message="components.popUpWarning.button.cancel"
                onClick={handleToggle}
                isSecondary
              />
              <ButtonModal message="form.button.done" type="submit" />
            </section>
          </ModalFooter>
        )}
      </form>
    </Modal>
  );
};

export default FormModal;
