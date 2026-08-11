import { createContext, useContext } from 'react';

interface EditModeCtx {
  editMode: boolean;
  toggle: () => void;
}

export const EditModeContext = createContext<EditModeCtx>({
  editMode: false,
  toggle: () => {},
});

export function useEditMode(): EditModeCtx {
  return useContext(EditModeContext);
}
