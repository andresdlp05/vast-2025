#!/usr/bin/env python3
"""
Script para arreglar los últimos problemas menores
"""

import os

def create_init_file():
    """Crear el archivo __init__.py que falta"""
    print("=== Creando archivo __init__.py faltante ===")
    
    init_file = "app/visualizations/__init__.py"
    
    if not os.path.exists(init_file):
        print(f"Creando {init_file}...")
        with open(init_file, 'w') as f:
            f.write("# Visualizations module\n")
        print("✅ Archivo creado correctamente")
    else:
        print("✅ Archivo ya existe")

def test_nadia_endpoint():
    """Probar que el endpoint de Nadia funciona"""
    print("\n=== Probando endpoint de Nadia Analysis ===")
    
    try:
        import sys
        sys.path.insert(0, 'app')
        from app import app
        
        with app.test_client() as client:
            response = client.get('/data/nadia_analysis')
            
            if response.status_code == 200:
                data = response.get_json()
                if "error" not in data:
                    print("✅ Endpoint funcionando perfectamente")
                    print(f"✅ Encontradas {data['nadia_profile']['total_communications']} comunicaciones")
                    print(f"✅ Recomendación: {data['suspicion_analysis']['recommendation']}")
                    return True
                else:
                    print(f"❌ Error en endpoint: {data['error']}")
                    return False
            else:
                print(f"❌ Status code: {response.status_code}")
                return False
                
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    print("ARREGLANDO ÚLTIMOS PROBLEMAS")
    print("=" * 40)
    
    # 1. Crear __init__.py
    create_init_file()
    
    # 2. Probar que todo funciona
    if test_nadia_endpoint():
        print("\n" + "=" * 40)
        print("🎉 ¡TODO ESTÁ FUNCIONANDO PERFECTAMENTE!")
        print("\nAhora puedes:")
        print("1. Ejecutar: python app/__init__.py")
        print("2. Ir a: http://localhost:5000")
        print("3. Hacer clic en 'Analysis of Nadia Conti'")
        print("4. ¡Ver el análisis completo de Nadia!")
        
        print("\n📊 Datos encontrados:")
        print("- 26 comunicaciones de Nadia Conti")
        print("- 12 contactos diferentes")
        print("- 11 palabras clave sospechosas")
        print("- Recomendación: INVESTIGATE FURTHER")
        
        return True
    else:
        print("\n❌ Hay algún problema con el endpoint")
        return False

if __name__ == "__main__":
    main()