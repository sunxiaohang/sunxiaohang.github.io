import { createContext, useContext } from 'react';

export const EditModeContext = createContext(false);

export function useEditMode(): boolean {
  return useContext(EditModeContext);
}
