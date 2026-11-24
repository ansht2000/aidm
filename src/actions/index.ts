import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  claimCharacter,
  createTable,
  endGame,
  hostAdvance,
  joinTable,
  leaveTable,
  retryDm,
  rollDice,
  setReady,
  startGame,
  submitAction,
  tick,
} from './game-actions'

export const actions: Record<string, ActionHandler<Env>> = {
  createTable,
  joinTable,
  leaveTable,
  claimCharacter,
  setReady,
  startGame,
  submitAction,
  rollDice,
  tick,
  hostAdvance,
  retryDm,
  endGame,
}
