// Copyright (C) 2018 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import '../tracks/all_frontend';

import * as m from 'mithril';

import {forwardRemoteCalls, Remote} from '../base/remote';
import {State} from '../common/state';
import {
  takeWasmEngineWorkerPort,
  warmupWasmEngineWorker
} from '../controller/wasm_engine_proxy';

import {ControllerProxy} from './controller_proxy';
import {globals} from './globals';
import {HomePage} from './home_page';
import {ViewerPage} from './viewer_page';

function createController(): ControllerProxy {
  const worker = new Worker('controller_bundle.js');
  worker.onerror = e => {
    console.error(e);
  };
  const port = worker as {} as MessagePort;
  return new ControllerProxy(new Remote(port));
}

/**
 * The API the main thread exposes to the controller.
 */
class FrontendApi {
  updateState(state: State) {
    globals.state = state;
    this.redraw();
  }

  publishTrackData(id: string, data: {}) {
    globals.trackDataStore.set(id, data);
    this.redraw();
  }

  publishQueryResult(id: string, data: {}) {
    globals.queryResults.set(id, data);
    this.redraw();
  }

  /**
   * Creates a new trace processor wasm engine (backed by a worker running
   * engine_bundle.js) and returns a MessagePort for talking to it.
   * This indirection is due to workers not being able create workers in
   * Chrome which is tracked at: crbug.com/31666
   * TODO(hjd): Remove this once the fix has landed.
   */
  createWasmEnginePort(): MessagePort {
    return takeWasmEngineWorkerPort();
  }

  private redraw(): void {
    if (globals.state.route && globals.state.route !== m.route.get()) {
      m.route.set(globals.state.route);
    } else {
      m.redraw();
    }
  }
}

async function main() {
  const controller = createController();
  const channel = new MessageChannel();
  forwardRemoteCalls(channel.port2, new FrontendApi());
  globals.state = await controller.initAndGetState(channel.port1);
  globals.dispatch = controller.dispatch.bind(controller);
  globals.trackDataStore = new Map<string, {}>();
  globals.queryResults = new Map<string, {}>();
  warmupWasmEngineWorker();

  m.route(document.body, '/', {
    '/': HomePage,
    '/viewer': ViewerPage,
  });

  // tslint:disable-next-line no-any
  (window as any).m = m;
  // tslint:disable-next-line no-any
  (window as any).globals = globals;
}

main();