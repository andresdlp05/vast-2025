#!/usr/bin/env python3
"""
Script de verificación rápida para confirmar que Nadia Analysis funciona
"""

import os
import sys
import json

def test_file_structure():
    """Verificar que todos los archivos necesarios existen"""
    print("=== Verificando estructura de archivos ===")
    
    required_files = [
        "app/__init__.py",
        "app/visualizations/__init__.py", 
        "app/visualizations/nadia_analysis.py",
        "app/templates/nadia_analysis.html",
        "app/static/js/nadia_analysis.js"
    ]
    
    all_good = True
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✅ {file_path}")
        else:
            print(f"❌ {file_path} - FALTA")
            all_good = False
    
    return all_good

def test_data_files():
    """Verificar archivos de datos"""
    print("\n=== Verificando archivos de datos ===")
    
    if not os.path.exists("data"):
        print("❌ Directorio 'data' no existe")
        return False
    
    data_files = os.listdir("data")
    json_files = [f for f in data_files if f.endswith('.json')]
    
    print(f"Archivos JSON encontrados: {json_files}")
    
    if not json_files:
        print("❌ No hay archivos JSON")
        return False
    
    # Probar cargar el primer archivo JSON
    first_json = os.path.join("data", json_files[0])
    try:
        with open(first_json, 'r') as f:
            data = json.load(f)
        print(f"✅ Archivo JSON válido: {json_files[0]}")
        print(f"   Claves principales: {list(data.keys())}")
        return True
    except Exception as e:
        print(f"❌ Error cargando {json_files[0]}: {e}")
        return False

def test_module_import():
    """Probar importar el módulo nadia_analysis"""
    print("\n=== Probando importación del módulo ===")
    
    try:
        sys.path.insert(0, 'app')
        from visualizations import nadia_analysis
        print("✅ Módulo nadia_analysis importado correctamente")
        
        # Verificar atributos requeridos
        if hasattr(nadia_analysis, 'NAME'):
            print(f"✅ NAME: {nadia_analysis.NAME}")
        if hasattr(nadia_analysis, 'TITLE'):
            print(f"✅ TITLE: {nadia_analysis.TITLE}")
        if hasattr(nadia_analysis, 'get_data'):
            print("✅ Función get_data encontrada")
        
        return True
    except ImportError as e:
        print(f"❌ Error importando módulo: {e}")
        return False
    except Exception as e:
        print(f"❌ Error inesperado: {e}")
        return False

def test_flask_app():
    """Probar cargar la aplicación Flask"""
    print("\n=== Probando aplicación Flask ===")
    
    try:
        sys.path.insert(0, 'app')
        from app import app
        print("✅ Aplicación Flask cargada correctamente")
        
        # Verificar configuración
        print("Configuración de archivos de datos:")
        data_configs = ['COMMUNICATION_FILE', 'DATA_FILE', 'RELATIONSHIPS_FILE', 'HEATMAP_SIMILARITY_FILE']
        for config in data_configs:
            if config in app.config:
                file_path = app.config[config]
                if os.path.exists(file_path):
                    print(f"✅ {config}: {os.path.basename(file_path)}")
                else:
                    print(f"⚠️  {config}: {os.path.basename(file_path)} (archivo no existe)")
            else:
                print(f"❌ {config}: No configurado")
        
        return True
    except ImportError as e:
        print(f"❌ Error importando app Flask: {e}")
        return False
    except Exception as e:
        print(f"❌ Error cargando app Flask: {e}")
        return False

def test_endpoint():
    """Probar el endpoint de nadia_analysis"""
    print("\n=== Probando endpoint /data/nadia_analysis ===")
    
    try:
        sys.path.insert(0, 'app')
        from app import app
        
        with app.test_client() as client:
            response = client.get('/data/nadia_analysis')
            
            print(f"Status code: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    data = response.get_json()
                    if "error" in data:
                        print(f"❌ Endpoint retornó error: {data['error']}")
                        return False
                    else:
                        print("✅ Endpoint funcionando correctamente")
                        print(f"   Claves en respuesta: {list(data.keys())}")
                        
                        # Verificar datos específicos
                        if 'nadia_profile' in data:
                            profile = data['nadia_profile']
                            print(f"   Total comunicaciones: {profile.get('total_communications', 0)}")
                        
                        return True
                except Exception as e:
                    print(f"❌ Error parseando respuesta JSON: {e}")
                    print(f"   Respuesta cruda: {response.get_data().decode()[:200]}...")
                    return False
            else:
                print(f"❌ Endpoint retornó status {response.status_code}")
                print(f"   Respuesta: {response.get_data().decode()}")
                return False
                
    except Exception as e:
        print(f"❌ Error probando endpoint: {e}")
        return False

def main():
    """Función principal"""
    print("VERIFICACIÓN RÁPIDA DE NADIA ANALYSIS")
    print("=" * 50)
    
    tests = [
        ("Estructura de archivos", test_file_structure),
        ("Archivos de datos", test_data_files), 
        ("Importación de módulo", test_module_import),
        ("Aplicación Flask", test_flask_app),
        ("Endpoint de datos", test_endpoint)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ Error en test {test_name}: {e}")
            results.append((test_name, False))
    
    # Resumen final
    print("\n" + "=" * 50)
    print("RESUMEN DE RESULTADOS:")
    print("=" * 50)
    
    all_passed = True
    for test_name, passed in results:
        status = "✅ PASÓ" if passed else "❌ FALLÓ"
        print(f"{test_name}: {status}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 50)
    if all_passed:
        print("🎉 ¡TODOS LOS TESTS PASARON!")
        print("\nAhora puedes:")
        print("1. Ejecutar: python app/__init__.py")
        print("2. Ir a: http://localhost:5000")
        print("3. Hacer clic en 'Analysis of Nadia Conti'")
        print("4. ¡Debería funcionar!")
    else:
        print("⚠️  ALGUNOS TESTS FALLARON")
        print("\nRevisa los errores arriba y:")
        print("1. Verifica que todos los archivos estén en su lugar")
        print("2. Asegúrate de haber reemplazado el contenido de los archivos")
        print("3. Verifica que tienes archivos JSON válidos en /data")
    
    return all_passed

if __name__ == "__main__":
    success = main()
    if not success:
        sys.exit(1)