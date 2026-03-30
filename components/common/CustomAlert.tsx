import { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
  onDismiss: () => void;
}

export function CustomAlert({ visible, title, message, buttons, onDismiss }: CustomAlertProps) {
  const isRow = buttons.length <= 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialog}>
              {/* 제목 + 메시지 */}
              <View style={styles.content}>
                <Text style={styles.title}>{title}</Text>
                {message ? <Text style={styles.message}>{message}</Text> : null}
              </View>

              {/* 버튼 영역 */}
              <View style={styles.divider} />
              {isRow ? (
                <View style={styles.rowButtons}>
                  {buttons.map((btn, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.rowBtn, i > 0 && styles.rowBtnBorder]}
                      onPress={() => { onDismiss(); btn.onPress?.(); }}
                      activeOpacity={0.6}
                    >
                      <Text style={[styles.btnText, getBtnTextStyle(btn.style)]}>
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.colButtons}>
                  {buttons.map((btn, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.colBtn, i > 0 && styles.colBtnBorder]}
                      onPress={() => { onDismiss(); btn.onPress?.(); }}
                      activeOpacity={0.6}
                    >
                      <Text style={[styles.btnText, getBtnTextStyle(btn.style)]}>
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function getBtnTextStyle(style?: AlertButton['style']) {
  if (style === 'cancel') return styles.btnCancel;
  if (style === 'destructive') return styles.btnDestructive;
  return styles.btnDefault;
}

interface AlertConfig {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

export function useCustomAlert() {
  const [config, setConfig] = useState<AlertConfig | null>(null);

  function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
    setConfig({
      title,
      message,
      buttons: buttons ?? [{ text: '확인', style: 'default' }],
    });
  }

  const alertElement = config ? (
    <CustomAlert
      visible
      title={config.title}
      message={config.message}
      buttons={config.buttons}
      onDismiss={() => setConfig(null)}
    />
  ) : null;

  return { showAlert, alertElement };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  dialog: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#191F28',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  message: {
    fontSize: 14,
    color: '#8B95A1',
    textAlign: 'center',
    lineHeight: 21,
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F4F6',
  },

  // 2버튼 가로 배치
  rowButtons: {
    flexDirection: 'row',
  },
  rowBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBtnBorder: {
    borderLeftWidth: 1,
    borderLeftColor: '#F2F4F6',
  },

  // 3버튼 세로 배치 — flex:1 사용 안 함, height는 padding으로 결정
  colButtons: {
    flexDirection: 'column',
  },
  colBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colBtnBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F2F4F6',
  },

  // 버튼 텍스트 스타일
  btnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  btnDefault: {
    color: '#3182F6',
  },
  btnCancel: {
    color: '#8B95A1',
    fontWeight: '500',
  },
  btnDestructive: {
    color: '#F04452',
  },
});
