import { Store } from 'redux';
import { ReduxStoreConfig } from './createReduxStore';
import { getStorageItem, setStorage, setStorageItem } from '../../libs/storage';

export const TYPE_PERSIST = 'ReduxModel/Persist';

let globalStore: Store | undefined;
const defaultPersistOption: { __persist: { version: number | string } } = {
  __persist: { version: -1 },
};
const KEY_PREFIX = 'ReduxModel:Persist:';
let whiteList: string[] = [];
let blackList: string[] = [];
let subscription: string[] = [];
let persistReducers: Record<string, any> = {};
let objectStrings: Record<string, string> = {};
let config: ReduxStoreConfig['persist'] = false;
let ready: boolean = false;
let readyEvents: Function[] = [];

const resetPersist = (): void => {
  persistReducers = {};
  restorePersist();
};

const persistIsReady = () => {
  ready = true;

  if (readyEvents.length) {
    readyEvents.forEach(item => item());
    readyEvents = [];
  }
};

const restorePersist = (): void => {
  if (!config) {
    return;
  }

  const finalReducers = {};

  Object.keys(persistReducers).forEach((key) => {
    finalReducers[key] = objectStrings[key];
  });

  setStorageItem(KEY_PREFIX + config.key, JSON.stringify({
    ...finalReducers,
    ...defaultPersistOption,
  }));
};

const parseStorageData = (data: string | null) => {
  if (!config) {
    return;
  }

  if (data === null) {
    resetPersist();
  } else {
    try {
      const tempReducers = JSON.parse(data);
      if (tempReducers.__persist.version === config.version) {
        let shouldRestore = false;
        delete tempReducers.__persist;

        persistReducers = {};
        Object.keys(tempReducers).forEach((key) => {
          if (passPersistReducerName(key)) {
            objectStrings[key] = tempReducers[key];
            persistReducers[key] = JSON.parse(tempReducers[key]);
          } else {
            shouldRestore = true;
          }
        });

        if (shouldRestore) {
          restorePersist();
        }
      } else {
        resetPersist();
      }
    } catch (e) {
      resetPersist();
      console.error('Unable to parser persist reducers from storage: ' + e.message);
    }
  }

  if (subscription.length) {
    const payload: Record<string, any> = {};

    subscription.forEach((key) => {
      if (persistReducers.hasOwnProperty(key)) {
        payload[key] = persistReducers[key];
      }
    });
    subscription = [];

    globalStore?.dispatch({
      type: TYPE_PERSIST,
      payload,
    });
  }

  persistIsReady();
};

export const setPersistConfig = (persist: ReduxStoreConfig['persist']): void => {
  config = persist;

  if (persist) {
    setStorage(persist.storage);
    whiteList = persist.whitelist ? persist.whitelist.map((item) => item.getReducerName()) : [];
    blackList = persist.blacklist ? persist.blacklist.map((item) => item.getReducerName()) : [];
    defaultPersistOption.__persist.version = persist.version;
  }
};

export const handlePersist = (store: Store) => {
  globalStore = store;

  if (config) {
    const storageData = getStorageItem(KEY_PREFIX + config.key) as string | null | Promise<string | null>;

    if (storageData === null || typeof storageData === 'string') {
      parseStorageData(storageData);
    } else {
      storageData.then(parseStorageData);
    }
  } else {
    persistIsReady();
  }
};

const passPersistReducerName = (reducerName: string): boolean => {
  if (!config) {
    return false;
  }

  if (blackList.length) {
    return !blackList.includes(reducerName);
  } else if (whiteList.length) {
    return whiteList.includes(reducerName);
  }

  return true;
};

export const switchInitData = (reducerName: string, state: any): any => {
  if (!passPersistReducerName(reducerName)) {
    return state;
  }

  // For code splitting model, we can get persist immediately.
  if (ready) {
    const persistState = persistReducers[reducerName];
    if (persistState === undefined) {
      return state;
    }
    return persistState;
  }

  subscription.push(reducerName);
  return state;
};

export const updatePersistState = (state: any): void => {
  if (!config || !ready) {
    return;
  }

  const finalReducers: Record<string, any> = { ...persistReducers };

  Object.keys(state).forEach((key) => {
    if (passPersistReducerName(key)) {
      finalReducers[key] = state[key];

      if (state[key] !== persistReducers[key]) {
        objectStrings[key] = JSON.stringify(state[key]);
      }
    }
  });

  persistReducers = finalReducers;
  restorePersist();
};

export const onPersistReady = (fn: () => void): void => {
  if (ready) {
    fn();
  } else {
    readyEvents.push(fn);
  }
};