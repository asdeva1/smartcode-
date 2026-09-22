import { createTheme } from '@mui/material/styles';
import { colors, typography, radii } from './tokens';

/**
 * Deliberately restrained MUI theme - compact density, muted palette,
 * minimal border radius, no default MUI gradients/shadows escalation.
 * This is what keeps the app from reading as a generic AI-generated
 * dashboard - see brief Section 12/14.
 */
export const smartCodeTheme = createTheme({
  palette: {
    primary: { main: colors.brand[500], dark: colors.brand[700], light: colors.brand[100] },
    background: { default: colors.neutral[50], paper: colors.neutral[0] },
    text: { primary: colors.neutral[900], secondary: colors.neutral[500] },
    divider: colors.neutral[200],
  },
  typography: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: radii.md },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: radii.sm } },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiTableCell: {
      styleOverrides: { root: { padding: '10px 16px', fontSize: typography.sizes.base } },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: radii.sm, fontWeight: 600 } },
    },
  },
});
